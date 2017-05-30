var path = require('path')
var fedexService = require(path.join(__dirname, './core/fedex-service'))

fedexService.start(function (err, message) {
  if(err) return console.log(err)
  console.log(message)
})
