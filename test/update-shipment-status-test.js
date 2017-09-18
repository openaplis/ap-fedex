'use strict'

const path = require('path')
const updateShipmentStatus = require(path.join(__dirname, '../src/core/update-shipment-status'))

describe('Update Shipment Status Tests', function() {

  describe('update', function() {
    this.timeout(50000)
    it('Whats up', function(done) {
      updateShipmentStatus.update(function (err, result) {
        if(err) return console.log(err)
        console.log(result)
        done()
      })
    })
  })

})
