'use strict'

const path = require('path')
const grpc = require('grpc')

var PROTO_PATH = path.join(__dirname, 'fedex.proto')

const fedex_proto = grpc.load(PROTO_PATH).fedex
const client = new fedex_proto.FedexService('localhost:50052', grpc.credentials.createInsecure())

module.exports = {

  ping: function (message, callback) {
    client.ping(message, function(err, response) {
      if(err) return callback(err)
      callback(null, response)
    })
  },

  updateShipments: function (message, callback) {
    client.updateShipments(message, function(err, response) {
      if(err) return callback(err)
      callback(null, response)
    })
  }

}
