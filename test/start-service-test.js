var path = require('path')
var fedexClient = require('../src/index').fedexClient

fedexClient.ping({ message: 'hello' }, function (err, message) {
  console.log(message)
})
