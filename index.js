var axios = require("axios")
const { exit } = require("process")
axios.defaults.withCredentials = true

var pkgsService
var feedsService

const ARTIFACTS =
  [
    "@ewam/kernel",
    "@ewam/node-hosting",
    "@ewam/clickonce",
    "@ewam/library",
    "@ewam/wsm",
    "@ewam/wsm-gsp",
    "@ewam/wsm-clickonce",
    "@ewam/wsm-isapi",
    "@ewam/tgv-standalone",
    "@ewam/tgv-multiuser",
    "@ewam/test"
  ]

const nbDaysForRetention = 30

function handleError(err) {
  if (axios.isAxiosError(err)) {
    console.log(err.config.headers)
    console.error(`API ${err.config.method} with url "${err.config.url}" responded with "${err.response && err.response.status}/${err.code}"`)
    if (err && err.response && err.response.data) {
      console.log(err.response.data)
    }
  } else {
    console.error(err)
  }
}

function init(options = { organization, project, token }) {
  pkgsService = axios.create({ baseURL: `https://pkgs.dev.azure.com/${options.organization}/${options.project}` })
  feedsService = axios.create({ baseURL: `https://feeds.dev.azure.com/${options.organization}/${options.project}` })
}

async function run() {
  try {
    if (!process.env.USER_EMAIL || !process.env.AZURE_PAT) {
      console.error("Please provide USER_EMAIL and AZURE_PAT")
      exit(1)
    }

    const PAT = `${process.env.USER_EMAIL}:${process.env.AZURE_PAT}`

    var options = { organization: 'mphasis-wyde', project: 'ewam', token: Buffer.from(PAT).toString('base64') }
    axios.defaults.headers.common['Authorization'] = `Basic ${options.token}`;

    init(options)
    const packages = await feedsService.get("/_apis/packaging/Feeds/ewam/packages?api-version=6.0-preview.1").then(res => res.data)
    console.log(`We have a total of ${packages.count} packages`)

    for (const package of packages.value.filter(item => ARTIFACTS.includes(item.name))) {
      console.log('Managing release and retention for', package.name)
      const res = await axios.get(package._links.versions.href).then(res => res.data)
      const versions = res.value.filter(item => !item.isDeleted)
      console.log(`We have a total of ${versions.length} versions for this artifact.`)
      
      for (const version of versions) {
        if (version.normalizedVersion.indexOf("-") > -1) {
          var publishedOn = new Date(version.publishDate)
          var currentDate = new Date()
          const nbDays = (currentDate - publishedOn) / 86400000
          if (nbDays > nbDaysForRetention) {
            console.log("Unpublishing", package.name, version.normalizedVersion, '- it has been alive for', nbDays.toFixed(0), 'days')
            await pkgsService
              .delete(`/_apis/packaging/feeds/56f0853f-8bf5-4fd2-ac57-5aa9545e88df/npm/${encodeURIComponent(package.name)}/versions/${version.version}?api-version=6.0-preview.1`)
          }
        } 
      }
    }
  } catch (e) {
    handleError(e)
  }
}

run()