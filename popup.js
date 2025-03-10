document.addEventListener("DOMContentLoaded", () => {
  // DOM elements
  const searchForm = document.getElementById("searchForm")
  const resultsSection = document.getElementById("resultsSection")
  const savedJobsSection = document.getElementById("savedJobsSection")
  const settingsSection = document.getElementById("settingsSection")
  const jobList = document.getElementById("jobList")
  const savedJobList = document.getElementById("savedJobList")
  const loadingIndicator = document.getElementById("loadingIndicator")
  const noResults = document.getElementById("noResults")
  const noSavedJobs = document.getElementById("noSavedJobs")

  // Buttons
  const searchBtn = document.getElementById("searchBtn")
  const savedJobsBtn = document.getElementById("savedJobsBtn")
  const settingsBtn = document.getElementById("settingsBtn")
  const backToSearch = document.getElementById("backToSearch")
  const backFromSaved = document.getElementById("backFromSaved")
  const backFromSettings = document.getElementById("backFromSettings")
  const saveSettings = document.getElementById("saveSettings")

  // Form inputs
  const jobTitleInput = document.getElementById("jobTitle")
  const locationInput = document.getElementById("location")
  const remoteFilter = document.getElementById("remoteFilter")
  const fullTimeFilter = document.getElementById("fullTimeFilter")
  const partTimeFilter = document.getElementById("partTimeFilter")
  const contractFilter = document.getElementById("contractFilter")
  const keywordsInput = document.getElementById("keywords")
  const enableAlertsCheckbox = document.getElementById("enableAlerts")

  // Settings inputs
  const notificationToggle = document.getElementById("notificationToggle")
  const checkInterval = document.getElementById("checkInterval")

  // Load saved settings
  loadSettings()

  // Navigation event listeners
  savedJobsBtn.addEventListener("click", showSavedJobs)
  settingsBtn.addEventListener("click", showSettings)
  backToSearch.addEventListener("click", showSearchForm)
  backFromSaved.addEventListener("click", showSearchForm)
  backFromSettings.addEventListener("click", showSearchForm)

  // Action event listeners
  searchBtn.addEventListener("click", performSearch)
  saveSettings.addEventListener("click", saveUserSettings)

  // Load saved jobs when opening the saved jobs section
  function showSavedJobs() {
    hideAllSections()
    savedJobsSection.classList.remove("hidden")
    loadSavedJobs()
  }

  // Show settings section
  function showSettings() {
    hideAllSections()
    settingsSection.classList.remove("hidden")
  }

  // Show search form
  function showSearchForm() {
    hideAllSections()
    searchForm.classList.remove("hidden")
  }

  // Hide all sections
  function hideAllSections() {
    searchForm.classList.add("hidden")
    resultsSection.classList.add("hidden")
    savedJobsSection.classList.add("hidden")
    settingsSection.classList.add("hidden")
  }

  // Perform job search
  function performSearch() {
    // Show results section and loading indicator
    hideAllSections()
    resultsSection.classList.remove("hidden")
    loadingIndicator.classList.remove("hidden")
    noResults.classList.add("hidden")
    jobList.innerHTML = ""

    // Get search parameters
    const searchParams = {
      jobTitle: jobTitleInput.value.trim(),
      location: locationInput.value.trim(),
      filters: {
        remote: remoteFilter.checked,
        fullTime: fullTimeFilter.checked,
        partTime: partTimeFilter.checked,
        contract: contractFilter.checked,
      },
      keywords: keywordsInput.value
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k),
      enableAlerts: enableAlertsCheckbox.checked,
    }

    // Save search parameters
    chrome.storage.local.set({ lastSearch: searchParams })

    // Set up job alerts if enabled
    if (searchParams.enableAlerts) {
      setupJobAlerts(searchParams)
    }

    // Send message to background script to perform search
    chrome.runtime.sendMessage({ action: "performSearch", searchParams }, (response) => {
      loadingIndicator.classList.add("hidden")

      if (response && response.jobs && response.jobs.length > 0) {
        displayJobs(response.jobs)
      } else {
        noResults.classList.remove("hidden")
      }
    })
  }

  // Display jobs in the results list
  function displayJobs(jobs) {
    jobList.innerHTML = ""

    jobs.forEach((job) => {
      const jobElement = createJobElement(job, false)
      jobList.appendChild(jobElement)
    })
  }

  // Create job element for display
  function createJobElement(job, isSaved) {
    const li = document.createElement("li")
    li.className = "job-card p-4"
    li.dataset.jobId = job.id

    const companyLogo = job.companyLogo || "/icons/company-placeholder.png"

    li.innerHTML = `
      <div class="flex items-start">
        <img src="${companyLogo}" alt="${job.company}" class="w-10 h-10 rounded-md mr-3 object-contain bg-gray-100">
        <div class="flex-1 min-w-0">
          <h3 class="text-sm font-medium text-gray-900 truncate">${job.title}</h3>
          <p class="text-sm text-gray-500">${job.company}</p>
          <div class="flex flex-wrap items-center mt-1 text-xs text-gray-500">
            <span class="mr-2">${job.location}</span>
            ${job.isRemote ? '<span class="mr-2 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">Remote</span>' : ""}
            <span>${job.postedDate}</span>
          </div>
        </div>
        <div class="ml-2 flex flex-col space-y-2">
          ${
            isSaved
              ? `<button class="unsave-job-btn px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100">Unsave</button>`
              : `<button class="save-job-btn px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100">Save</button>`
          }
          <a href="${job.url}" target="_blank" class="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 text-center">Apply</a>
        </div>
      </div>
    `

    // Add event listeners for save/unsave buttons
    if (isSaved) {
      li.querySelector(".unsave-job-btn").addEventListener("click", () => {
        unsaveJob(job.id)
      })
    } else {
      li.querySelector(".save-job-btn").addEventListener("click", () => {
        saveJob(job)
      })
    }

    return li
  }

  // Save a job to storage
  function saveJob(job) {
    chrome.storage.local.get({ savedJobs: [] }, (data) => {
      const savedJobs = data.savedJobs

      // Check if job is already saved
      if (!savedJobs.some((savedJob) => savedJob.id === job.id)) {
        savedJobs.push(job)
        chrome.storage.local.set({ savedJobs: savedJobs }, () => {
          // Show a notification
          chrome.runtime.sendMessage({
            action: "showNotification",
            title: "Job Saved",
            message: `"${job.title}" at ${job.company} has been saved.`,
          })
        })
      }
    })
  }

  // Remove a job from saved jobs
  function unsaveJob(jobId) {
    chrome.storage.local.get({ savedJobs: [] }, (data) => {
      const savedJobs = data.savedJobs.filter((job) => job.id !== jobId)
      chrome.storage.local.set({ savedJobs: savedJobs }, () => {
        // Refresh the saved jobs list
        loadSavedJobs()
      })
    })
  }

  // Load saved jobs from storage
  function loadSavedJobs() {
    chrome.storage.local.get({ savedJobs: [] }, (data) => {
      const savedJobs = data.savedJobs
      savedJobList.innerHTML = ""

      if (savedJobs.length === 0) {
        noSavedJobs.classList.remove("hidden")
      } else {
        noSavedJobs.classList.add("hidden")

        savedJobs.forEach((job) => {
          const jobElement = createJobElement(job, true)
          savedJobList.appendChild(jobElement)
        })
      }
    })
  }

  // Set up job alerts
  function setupJobAlerts(searchParams) {
    chrome.storage.local.get({ jobAlerts: [] }, (data) => {
      const jobAlerts = data.jobAlerts || []

      // Check if this search is already saved as an alert
      const alertExists = jobAlerts.some(
        (alert) => alert.jobTitle === searchParams.jobTitle && alert.location === searchParams.location,
      )

      if (!alertExists) {
        jobAlerts.push({
          id: Date.now().toString(),
          jobTitle: searchParams.jobTitle,
          location: searchParams.location,
          filters: searchParams.filters,
          keywords: searchParams.keywords,
          lastChecked: null,
          enabled: true,
        })

        chrome.storage.local.set({ jobAlerts: jobAlerts })

        // Notify background script to set up alarms
        chrome.runtime.sendMessage({ action: "setupJobAlerts" })
      }
    })
  }

  // Load user settings
  function loadSettings() {
    chrome.storage.local.get(
      {
        notifications: true,
        checkInterval: 60,
      },
      (settings) => {
        notificationToggle.checked = settings.notifications
        checkInterval.value = settings.checkInterval.toString()

        // Also load last search if available
        chrome.storage.local.get({ lastSearch: null }, (data) => {
          if (data.lastSearch) {
            jobTitleInput.value = data.lastSearch.jobTitle || ""
            locationInput.value = data.lastSearch.location || ""
            remoteFilter.checked = data.lastSearch.filters?.remote || false
            fullTimeFilter.checked = data.lastSearch.filters?.fullTime || false
            partTimeFilter.checked = data.lastSearch.filters?.partTime || false
            contractFilter.checked = data.lastSearch.filters?.contract || false
            keywordsInput.value = data.lastSearch.keywords?.join(", ") || ""
            enableAlertsCheckbox.checked = data.lastSearch.enableAlerts || false
          }
        })
      },
    )
  }

  // Save user settings
  function saveUserSettings() {
    const settings = {
      notifications: notificationToggle.checked,
      checkInterval: Number.parseInt(checkInterval.value, 10),
    }

    chrome.storage.local.set(settings, () => {
      // Notify background script of settings change
      chrome.runtime.sendMessage({ action: "settingsUpdated", settings })

      // Show confirmation and return to search
      alert("Settings saved successfully!")
      showSearchForm()
    })
  }
})

