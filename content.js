// Wait for the page to fully load
window.addEventListener("load", () => {
  // Give LinkedIn a moment to render all job listings
  setTimeout(extractJobData, 3000)
})

// Extract job data from LinkedIn job search results
function extractJobData() {
  console.log("LinkedIn Job Assistant: Extracting job data...")

  // Get all job cards on the page
  const jobCards = document.querySelectorAll(".job-search-card")
  const extractedJobs = []

  jobCards.forEach((card, index) => {
    try {
      // Extract job details
      const jobId = card.dataset.jobId || `job-${Date.now()}-${index}`
      const titleElement = card.querySelector(".job-search-card__title")
      const companyElement = card.querySelector(".job-search-card__subtitle a")
      const locationElement = card.querySelector(".job-search-card__location")
      const dateElement = card.querySelector(".job-search-card__listdate")
      const logoElement = card.querySelector(".job-search-card__company-logo")

      // Get the job link
      const jobLink = card.querySelector("a.job-search-card__title")

      if (!titleElement || !jobLink) return // Skip if essential elements are missing

      const title = titleElement.textContent.trim()
      const company = companyElement ? companyElement.textContent.trim() : "Unknown Company"
      const location = locationElement ? locationElement.textContent.trim() : ""
      const postedDate = dateElement ? dateElement.textContent.trim() : ""
      const companyLogo = logoElement && logoElement.src ? logoElement.src : null
      const url = jobLink.href

      // Check if job is remote
      const isRemote = location.toLowerCase().includes("remote")

      // Get job description if available
      let description = ""

      // Click on the job to load its details (if not already selected)
      if (index === 0 && !document.querySelector(".job-details")) {
        jobLink.click()
        // Wait for job details to load
        setTimeout(() => {
          const descriptionElement = document.querySelector(".job-details__description")
          if (descriptionElement) {
            description = descriptionElement.textContent.trim()
          }

          // Add the job to extracted jobs
          addJobToExtractedList(jobId, title, company, location, postedDate, url, isRemote, companyLogo, description)
        }, 1000)
      } else {
        // Add the job to extracted jobs without description
        addJobToExtractedList(jobId, title, company, location, postedDate, url, isRemote, companyLogo, description)
      }
    } catch (error) {
      console.error("Error extracting job data:", error)
    }
  })

  // After a delay to allow for the first job's description to be fetched
  setTimeout(() => {
    // Send the extracted jobs to the background script
    chrome.runtime.sendMessage({
      action: "jobDataExtracted",
      jobs: extractedJobs,
    })

    console.log("LinkedIn Job Assistant: Extracted", extractedJobs.length, "jobs")
  }, 2000)

  // Helper function to add a job to the extracted list
  function addJobToExtractedList(id, title, company, location, postedDate, url, isRemote, companyLogo, description) {
    extractedJobs.push({
      id,
      title,
      company,
      location,
      postedDate,
      url,
      isRemote,
      companyLogo,
      description,
    })
  }
}

