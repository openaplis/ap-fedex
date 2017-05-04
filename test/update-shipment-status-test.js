'use strict'

const path = require('path')
const updateShipmentStatus = require(path.join(__dirname, '../src/index')).updateShipmentStatus

describe('Update Shipment Status Tests', function() {

  describe('update', function() {
    this.timeout(20000);
    it('Whats up', function(done) {
      updateShipmentStatus.update('hello', function (err, result) {
        if(err) return console.log(err)
        console.log(result)
        done()
      })
    })
  })

})
