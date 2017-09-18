'use strict'

const path = require('path')
const async = require('async')
const fs = require('fs')
const xml2js = require('xml2js')
const request = require('request')
const moment = require('moment')

const trackRequestTemplatePath = path.join(__dirname, 'track-request.xml')

const grpc = require('grpc')
const PROTO_PATH = path.join(__dirname, '../../node_modules/ap-protobuf/src/core/gateway.proto')
const gateway_proto = grpc.load(PROTO_PATH).gateway
const mysqlGateway = new gateway_proto.MySQLGateway(process.env.AP_GATEWAY_SERVICE_BINDING, grpc.credentials.createInsecure())

module.exports.update = function (callback) {
  var shipmentStatusList = []
  async.waterfall([

    function (callback) {
      var cmdSubmitterRequest = {
        sql: ['Select distinct todf.trackingNumber, t.reportNo ',
          'from tblTaskOrderDetail tod join tblTaskOrderDetailFedexShipment todf on tod.TaskOrderDetailId = todf.TaskOrderDetailid ',
          'join tblTaskOrder t on tod.TaskOrderid = t.TaskOrderId where tod.Acknowledged = 0 and todf.TrackingNumber is not null'].join('\n')
      }

      mysqlGateway.submitCmd(cmdSubmitterRequest, function (err, result) {
        if (err) return callback(err)
        var trackingNumbers = JSON.parse(result.json)
        callback(null, trackingNumbers)
      })
    },

    function (trackingNumbers, callback) {
      async.eachSeries(trackingNumbers, function (trackingNumber, callback) {
        var shipmentStatus = { trackingNumber: trackingNumber.trackingNumber, reportNo: trackingNumber.reportNo }
        shipmentStatusList.push(shipmentStatus)

        fs.readFile(trackRequestTemplatePath, function (err, requestTemplate) {
          if(err) return callback(err)

          async.waterfall([

            // create the tracking request
            function (callback) {
              xml2js.parseString(requestTemplate, function (err, result) {
                result['soapenv:Envelope']['soapenv:Body'][0]['v9:TrackRequest'][0]['v9:SelectionDetails'][0]['v9:PackageIdentifier'][0]['v9:Value'][0] = trackingNumber.trackingNumber
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
                //console.log('Got a response from Fedex for: ' + trackingNumber.reportNo + ':' + trackingNumber.trackingNumber)
            		callback(null, response.body)
            	})
            },

            // Get the track details from the response
            function (trackingRequestResponse, callback) {
              xml2js.parseString(trackingRequestResponse, function (err, result) {
                if(err) return callback(err)
            		var trackDetails = result['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['TrackReply'][0]['CompletedTrackDetails'][0]['TrackDetails'][0]

                var requestStatus = trackDetails.Notification[0]['Code'][0]
                if(requestStatus != '0') {
                  shipmentStatus.status = trackDetails.Notification[0]['Code'][0] + ': ' + trackDetails.Notification[0]['Message'][0]
                } else {
                  shipmentStatus.status = trackDetails.StatusDetail[0]['Code'][0] + ': ' + trackDetails.StatusDetail[0]['Description'][0]
                }

                callback(null, trackDetails)
            	})
            },

            // acknowledge the Task if appropriate
            function (trackDetails, callback) {
              if(trackDetails.Notification[0]['Code'][0] == '0' && trackDetails.StatusDetail[0]['Code'][0] != 'OC') {
                var acknowledgeDate = moment().format('YYYY-MM-DD HH:mm:ss')

                  var cmdSubmitterRequest = {
                    sql: [
                        'Update tblTaskOrderDetail tod',
                        'inner join tblTaskOrderDetailFedexShipment todf on  tod.TaskOrderDetailId = todf.TaskOrderDetailId',
                        'Set tod.Acknowledged = 1, tod.AcknowledgedbyId = 5134, tod.AcknowledgedByInitials = \'OP\', tod.AcknowledgedDate = \'' + acknowledgeDate + '\'',
                        'where todf.TrackingNumber = \'' + trackingNumber.trackingNumber + '\';',
                        'Update tblTaskOrder t',
                        'inner join tblTaskOrderDetail tod on t.TaskOrderId = tod.TaskOrderId',
                        'inner join tblTaskOrderDetailFedexShipment todf on tod.TaskOrderDetailId = todf.TaskOrderDetailId',
                        'Set t.Acknowledged = 1, t.AcknowledgedbyId = 5134, t.AcknowledgedByInitials = \'OP\', t.AcknowledgedDate = \'' + acknowledgeDate + '\'',
                        'where todf.TrackingNumber = \'' + trackingNumber.trackingNumber + '\';'
                      ].join('\n')
                  }

                  mysqlGateway.submitCmd(cmdSubmitterRequest, function (err, result) {
                    if(err) return callback(err)
                    console.log('Updated task for: ' + trackingNumber.ReportNo)
                    shipmentStatus.acknowledged = true
                    callback(null, trackDetails)
                  })

              } else {
                shipmentStatus.acknowledged = false
                callback(null, trackDetails)
    					}
            },

            // finalize Ship material Test Orders if appropriate
            function (trackDetails, callback) {
              if(trackDetails.Notification[0]['Code'][0] == '0' && trackDetails.StatusDetail[0]['Code'][0] != 'OC') {
                var finalTime = moment().format('YYYY-MM-DD')
                var finalDate = moment().format('YYYY-MM-DD HH:mm:ss')

                var cmdSubmitterRequest = {
                  sql: [
                    'Update tblPanelSetOrder Set Final = 1, FinalDate = \'' + finalDate + '\', FinalTime = \'' + finalTime + '\', ',
                    'AssignedToId = 5134, Signature = \'Auto Signature\' where ReportNo = \'' + trackingNumber.reportNo + '\' ',
                    'and panelSetId = 244 '
                  ].join('\n')
                }

                mysqlGateway.submitCmd(cmdSubmitterRequest, function (err, result) {
                  var resultObj = JSON.parse(result.json)
                  console.log('Finalize ShipMaterial Test Orders Rows affected: ' + resultObj[0].affectedRows)
                  if(err) return callback(err)
                  callback(null, trackDetails)
                })
              } else {
                callback(null, trackDetails)
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
    callback(null, shipmentStatusList)
  })

}
