'use strict'

const path = require('path')
const async = require('async')
const fs = require('fs')
const xml2js = require('xml2js')
const request = require('request')
const moment = require('moment')

const cmdSubmitter = require('ap-mysql').cmdSubmitter
const trackRequestTemplatePath = path.join(__dirname, 'track-request.xml')

module.exports.update = function (callback) {
  var sql = ['Select distinct todf.TrackingNumber, t.ReportNo ',
    'from tblTaskOrderDetail tod join tblTaskOrderDetailFedexShipment todf on tod.TaskOrderDetailId = todf.TaskOrderDetailid ',
    'join tblTaskOrder t on tod.TaskOrderid = t.TaskOrderId where tod.Acknowledged = 0 and todf.TrackingNumber is not null'].join('\n')

  async.waterfall([

    function (callback) {
      cmdSubmitter.submit(sql, function (err, trackingNumbers) {
        if(err) return callback(err)
        callback(null, trackingNumbers)
      })
    },

    function (trackingNumbers, callback) {
      async.eachSeries(trackingNumbers, function (trackingNumber, callback) {
        fs.readFile(trackRequestTemplatePath, function (err, requestTemplate) {
          if(err) return callback(err)

          async.waterfall([

            // create the tracking request
            function (callback) {
              xml2js.parseString(requestTemplate, function (err, result) {
                result['soapenv:Envelope']['soapenv:Body'][0]['v9:TrackRequest'][0]['v9:SelectionDetails'][0]['v9:PackageIdentifier'][0]['v9:Value'][0] = trackingNumber.TrackingNumber
                var builder = new xml2js.Builder()
                var trackingRequest = builder.buildObject(result)
                callback(null, trackingRequest)
              })
            },

            // Post the request to fedex
            function (trackingRequest, callback) {
              request({
            		url: "https://ws.fedex.com:443/web-services",
            		method: "POST",
            		headers: {
            			"content-type": "application/xml",
            		},
            		body: trackingRequest
            	}, function (err, response, body) {
                console.log('Got a response from Fedex for: ' + trackingNumber.ReportNo + ':' + trackingNumber.TrackingNumber)
            		callback(null, response.body)
            	})
            },

            // Get the status code from the response
            function (trackingRequestResponse, callback) {
              xml2js.parseString(trackingRequestResponse, function (err, result) {
                if(err) return callback(err)
            		var statusDetail = result['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['TrackReply'][0]['CompletedTrackDetails'][0]['TrackDetails'][0]['StatusDetail'][0]
                var statusCode = ''
            		if(statusDetail.Code == null) {
                  statusCode = 'NOCODESENT'
            		}	else {
            			statusCode = statusDetail.Code[0]
            		}
                console.log('Fedex returned code: ' + statusCode)
                callback(null, statusCode)
            	})
            },

            // acknowledge the Task
            function (status, callback) {
              if(status == 'DL' || status == 'DE' || status == 'SL' || status == 'FD' || status == 'SF' || status == 'OD' || status == 'HL' || status == 'PU') {
                var acknowledgedDate = moment().format('YYYY-MM-DD HH:mm:ss')
                var sqlUpdate = [
                    'Update tblTaskOrderDetail tod',
                    'inner join tblTaskOrderDetailFedexShipment todf on  tod.TaskOrderDetailId = todf.TaskOrderDetailId',
                    'Set tod.Acknowledged = 1, tod.AcknowledgedbyId = 5134, tod.AcknowledgedByInitials = \'OP\', tod.AcknowledgedDate = \'' + acknowledgedDate + '\'',
                    'where todf.TrackingNumber = \'' + trackingNumber.TrackingNumber + '\';',
                    'Update tblTaskOrder t',
                    'inner join tblTaskOrderDetail tod on t.TaskOrderId = tod.TaskOrderId',
                    'inner join tblTaskOrderDetailFedexShipment todf on tod.TaskOrderDetailId = todf.TaskOrderDetailId',
                    'Set t.Acknowledged = 1, t.AcknowledgedbyId = 5134, t.AcknowledgedByInitials = \'OP\', t.AcknowledgedDate = \'' + acknowledgedDate + '\'',
                    'where todf.TrackingNumber = \'' + trackingNumber.TrackingNumber + '\';'
                  ]

                  cmdSubmitter.submit(sqlUpdate.join(' '), function (err) {
                    if(err) return callback(err)
                    console.log('Updated task for: ' + trackingNumber.ReportNo)
                    callback(null)
                  })

              } else {
    						console.log('You might want to check: ' + trackingNumber.ReportNo + '/' + status)
                callback(null)
    					}
            }

          ], function (err) {
            if(err) callback(err)
            callback(null, 'inner waterfall all done.')
          })

        })
      }, function (err) {
        if(err) return callback(err)
        callback(null)
      })
    }

  ], function (err) {
    if(err) return callback(err)
    callback(null, 'Shipment status update complete.')
  })

}
