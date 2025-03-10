// Initialize alarms when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  setupJobAlertAlarms()
})

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "performSearch") {
    performLinkedInSearch(request.searchParams, sendResponse)
    return true // Keep the message channel open for async response
  } else if (request.action === "showNotification") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: request.title,
      message: request.message,
    })
  } else if (request.action === "setupJobAlerts") {
    setupJobAlertAlarms()
  } else if (request.action === "settingsUpdated") {
    updateAlarmSettings(request.settings)
  } else if (request.action === "jobDataExtracted") {
    processExtractedJobs(request.jobs, sender.tab.id)
  }
})

// Handle alarm events (for job alerts)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkJobAlerts") {
    checkForNewJobs()
  }
})

// Perform LinkedIn search by constructing URL and opening tab
function performLinkedInSearch(searchParams, sendResponse) {
  // Construct LinkedIn search URL
  let searchUrl = "https://www.linkedin.com/jobs/search/?keywords=" + encodeURIComponent(searchParams.jobTitle)

  if (searchParams.location) {
    searchUrl += "&location=" + encodeURIComponent(searchParams.location)
  }

  // Add filters
  const filterParams = []
  if (searchParams.filters.remote) {
    filterParams.push("f_WT=2")
  }
  if (searchParams.filters.fullTime) {
    filterParams.push("f_JT=F")
  }
  if (searchParams.filters.partTime) {
    filterParams.push("f_JT=P")
  }
  if (searchParams.filters.contract) {
    filterParams.push("f_JT=C")
  }

  if (filterParams.length > 0) {
    searchUrl += "&" + filterParams.join("&")
  }

  // Open LinkedIn in a new tab
  chrome.tabs.create({ url: searchUrl, active: true }, (tab) => {
    // Set up a listener for when content script extracts job data
    const tabId = tab.id

    // We'll wait for the content script to send us the extracted job data
    // This is handled by the message listener for 'jobDataExtracted'

    // Set a timeout in case the content script doesn't respond
    setTimeout(() => {
      // If we haven't received data yet, send an empty response
      sendResponse({ jobs: [] })
    }, 30000) // 30 second timeout
  })
}

// Process jobs extracted by content script
function processExtractedJobs(jobs, tabId) {
  // Store the jobs temporarily
  chrome.storage.local.set({ currentSearchResults: jobs })

  // Check if any of these jobs match saved alerts
  checkForJobMatches(jobs)
}

// Check if any jobs match saved alerts
function checkForJobMatches(jobs) {
  chrome.storage.local.get({ jobAlerts: [] }, (data) => {
    const jobAlerts = data.jobAlerts

    if (!jobAlerts || jobAlerts.length === 0) return

    const matchedJobs = []

    // For each job alert
    jobAlerts.forEach((alert) => {
      if (!alert.enabled) return

      // For each job, check if it matches the alert criteria
      jobs.forEach((job) => {
        if (jobMatchesAlert(job, alert)) {
          matchedJobs.push({
            job: job,
            alert: alert,
          })
        }
      })
    })

    // If we have matches, show notifications
    if (matchedJobs.length > 0) {
      showJobMatchNotifications(matchedJobs)
    }
  })
}

// Check if a job matches an alert's criteria
function jobMatchesAlert(job, alert) {
  // Check job title match
  if (alert.jobTitle && !job.title.toLowerCase().includes(alert.jobTitle.toLowerCase())) {
    return false
  }

  // Check location match if specified
  if (alert.location && !job.location.toLowerCase().includes(alert.location.toLowerCase())) {
    return false
  }

  // Check remote filter
  if (alert.filters.remote && !job.isRemote) {
    return false
  }

  // Check keywords
  if (alert.keywords && alert.keywords.length > 0) {
    const jobText = (job.title + " " + job.description).toLowerCase()
    const hasKeyword = alert.keywords.some((keyword) => jobText.includes(keyword.toLowerCase()))

    if (!hasKeyword) return false
  }

  return true
}

// Show notifications for matched jobs
function showJobMatchNotifications(matchedJobs) {
  chrome.storage.local.get({ notifications: true }, (settings) => {
    if (!settings.notifications) return

    // Limit to 5 notifications to avoid spam
    const jobsToNotify = matchedJobs.slice(0, 5)

    jobsToNotify.forEach((match, index) => {
      // Delay notifications slightly to avoid overwhelming the user
      setTimeout(() => {
        chrome.notifications.create(
          {
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "New Job Match: " + match.job.title,
            message: `${match.job.company} - ${match.job.location}`,
            buttons: [{ title: "View Job" }],
          },
          (notificationId) => {
            // Store the job URL to open if the user clicks the notification
            chrome.storage.local.set({
              [notificationId]: { url: match.job.url },
            })
          },
        )
      }, index * 1000)
    })
  })
}

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.storage.local.get(notificationId, (data) => {
    if (data[notificationId] && data[notificationId].url) {
      // Open the job URL in a new tab
      chrome.tabs.create({ url: data[notificationId].url })

      // Clean up the stored data
      chrome.storage.local.remove(notificationId)
    }
  })
})

// Set up alarms for job alerts
function setupJobAlertAlarms() {
  chrome.storage.local.get(
    {
      jobAlerts: [],
      checkInterval: 60,
      notifications: true,
    },
    (data) => {
      // If notifications are disabled, don't set up alarms
      if (!data.notifications) return

      // If we have job alerts, set up an alarm to check periodically
      if (data.jobAlerts && data.jobAlerts.length > 0) {
        // Clear any existing alarms
        chrome.alarms.clear("checkJobAlerts")

        // Create a new alarm
        chrome.alarms.create("checkJobAlerts", {
          periodInMinutes: data.checkInterval,
        })
      }
    },
  )
}

// Update alarm settings when user changes them
function updateAlarmSettings(settings) {
  // Clear existing alarm
  chrome.alarms.clear("checkJobAlerts")

  // If notifications are enabled, recreate the alarm with new interval
  if (settings.notifications) {
    chrome.alarms.create("checkJobAlerts", {
      periodInMinutes: settings.checkInterval,
    })
  }
}

// Check for new jobs based on saved alerts
function checkForNewJobs() {
  chrome.storage.local.get({ jobAlerts: [] }, (data) => {
    const jobAlerts = data.jobAlerts

    if (!jobAlerts || jobAlerts.length === 0) return

    // Find enabled alerts
    const enabledAlerts = jobAlerts.filter((alert) => alert.enabled)

    if (enabledAlerts.length === 0) return

    // For simplicity, we'll just check the first enabled alert
    // In a real extension, you might want to cycle through them or batch them
    const alertToCheck = enabledAlerts[0]

    // Perform a search for this alert
    const searchParams = {
      jobTitle: alertToCheck.jobTitle,
      location: alertToCheck.location,
      filters: alertToCheck.filters,
      keywords: alertToCheck.keywords,
      enableAlerts: false, // Don't create a new alert for this search
    }

    // Update the last checked time for this alert
    updateAlertLastChecked(alertToCheck.id)

    // Perform the search in the background
    performBackgroundSearch(searchParams)
  })
}

// Update the last checked time for an alert
function updateAlertLastChecked(alertId) {
  chrome.storage.local.get({ jobAlerts: [] }, (data) => {
    const jobAlerts = data.jobAlerts.map((alert) => {
      if (alert.id === alertId) {
        return { ...alert, lastChecked: new Date().toISOString() }
      }
      return alert
    })

    chrome.storage.local.set({ jobAlerts: jobAlerts })
  })
}

// Perform a search in the background (without opening a tab)
function performBackgroundSearch(searchParams) {
  // This would typically use the LinkedIn API if available
  // For this example, we'll simulate it by opening a tab and then closing it
  // In a real extension, you'd want to use proper API calls or a more elegant solution

  // Construct LinkedIn search URL
  let searchUrl = "https://www.linkedin.com/jobs/search/?keywords=" + encodeURIComponent(searchParams.jobTitle)

  if (searchParams.location) {
    searchUrl += "&location=" + encodeURIComponent(searchParams.location)
  }

  // Add filters
  const filterParams = []
  if (searchParams.filters.remote) {
    filterParams.push("f_WT=2")
  }
  if (searchParams.filters.fullTime) {
    filterParams.push("f_JT=F")
  }
  if (searchParams.filters.partTime) {
    filterParams.push("f_JT=P")
  }
  if (searchParams.filters.contract) {
    filterParams.push("f_JT=C")
  }

  if (filterParams.length > 0) {
    searchUrl += "&" + filterParams.join("&")
  }

  // Open LinkedIn in a new tab but don't focus on it
  chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
    // The content script will extract job data and send it back
    // After a delay, close the tab
    setTimeout(() => {
      try {
        chrome.tabs.remove(tab.id)
      } catch (e) {
        console.error("Error removing tab:", e)
      }
    }, 15000) // Give it 15 seconds to load and extract data
  })
}

