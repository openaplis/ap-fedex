'use strict'

const path = require('path')
const async = require('async')
const fs = require('fs')
const xml2js = require('xml2js')
const request = require('request')
const moment = require('moment')
const grpc = require('grpc')

const trackRequestTemplatePath = path.join(__dirname, 'track-request.xml')

const PROTO_PATH = path.join(__dirname, '../../node_modules/ap-protobuf/src/core/mysql/mysql-service.proto')
const mysql_proto = grpc.load(PROTO_PATH).mysql
const mysqlService = new mysql_proto.MysqlService(process.env.AP_MYSQL_SERVICE_BINDING, grpc.credentials.createInsecure())

var shipmentStatuList = []

module.exports.update = function (callback) {

  async.waterfall([

    function (callback) {
      mysqlService.getUnacknowledgedTrackingNumbers("No Message", function (err, trackingNumbers) {
        if(err) return callback(err)
        callback(null, trackingNumbers)
      })
    },

    function (result, callback) {
      async.eachSeries(result.trackingNumbers, function (trackingNumber, callback) {
        var shipmentStatus = { trackingNumber: trackingNumber.trackingNumber, reportNo: trackingNumber.reportNo }
        shipmentStatuList.push(shipmentStatus)

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
                console.log('Got a response from Fedex for: ' + trackingNumber.reportNo + ':' + trackingNumber.trackingNumber)
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
              shipmentStatus.status = status
              if(status == 'DL' || status == 'DE' || status == 'SL' || status == 'FD' || status == 'SF' || status == 'OD' || status == 'HL' || status == 'PU') {
                var acknowledgeDate = moment().format('YYYY-MM-DD HH:mm:ss')
                mysqlService.acknowledgeTaskOrder({ acknowledgeDate: acknowledgeDate, trackingNumber: trackingNumber.trackingNumber }, function (err) {
                  if(err) return callback(err)
                  console.log('Updated task for: ' + trackingNumber.ReportNo)
                  shipmentStatus.acknowledged = true
                  callback(null)
                })

              } else {
                shipmentStatus.acknowledged = false
    						console.log('You might want to check: ' + trackingNumber.reportNo + '/' + status)
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
    callback(null, shipmentStatuList)
  })

}
