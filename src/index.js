'use strict'

const path = require('path')
const fedexClient = require('./core/fedex-client')
const fedexService = require('./core/fedex-service')

module.exports = {
  fedexClient: fedexClient,
  fedexService: fedexService
}
