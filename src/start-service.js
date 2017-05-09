var path = require('path')
var fedexService = require(path.join(__dirname, 'index.js')).fedexService

fedexService.start(function (err, message) {
  console.log(message)
})
