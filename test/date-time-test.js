'use strict'

const moment = require('moment')
const path = require('path')


describe('Datetime Test with Moment', function() {

  it('Moment Test', function(done) {
    var date = moment().format('YYYY-MM-DD HH:mm:ss')
    console.log(date)
    done()
  })

})
