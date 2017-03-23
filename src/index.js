var grpc = require('grpc')
var sql = require('mssql')
var request = require('request')
var fs = require('fs')
var xml2js = require('xml2js')
var dateFormat = require('dateformat')

var PROTO_PATH = 'node_modules/ap-protobuf/src/fedex/fedex.proto'
var protobuf = grpc.load(PROTO_PATH).fedex

var sqlConnectionConfig = { }

function main() {
  setupMSSQLConfig()
  var server = new grpc.Server()
  server.addProtoService(protobuf.UpdateFedexShipments.service, { update: UpdateShipments })
  server.bind('0.0.0.0:50052', grpc.ServerCredentials.createInsecure())
  server.start()
  console.log('listening on port 50052!')
}

function setupMSSQLConfig() {
  if(process.env.NODE_ENV='development') {
    fs.readFile('../ap-secrets/mssql-config/mssql-config.txt', 'utf8', function(err, data) {
        if (err) throw err
        var json = Buffer(data, 'base64').toString('utf-8')        
        console.log(json)
    })
  }
  else {
    fs.readFile('/etc/secrets/mssql-config', 'utf8', function(err, data) {
        if (err) throw err
        sqlConnectionConfig = JSON.parse(data)
    })
  }
}

function UpdateShipments(call, callback) {
  getUnacknowledgedTrackingNumbers(function(trackingNumbers) {
  	handleTrackingNumbers(trackingNumbers, 0, function (err, response) {
      callback(null, response)
    })
  })
}

function handleTrackingNumbers(trackingNumbers, i, callback)
{
	if(i+1 <= trackingNumbers.length) {
		createTrackingRequest(trackingNumbers[i].TrackingNumber, function(trackingRequest) {
			postTrackingRequest(trackingRequest, function(response) {
				getTrackingStatus(response, function(status) {
					if(status == 'DL' || status == 'DE' || status == 'SL' || status == 'FD' || status == 'SF' || status == 'OD' || status == 'HL' || status == 'PU') {
						acknowledgeTask(trackingNumbers[i].TrackingNumber, function(result) {
							console.log(result)
              handleTrackingNumbers(trackingNumbers, i + 1, callback)
						})
					}
					else{
						console.log('This status has not been handled yet: ' + trackingNumbers[i].TrackingNumber + '/' + status)
            handleTrackingNumbers(trackingNumbers, i + 1, callback)
					}
				})
			})
		})
	}
  else {
    callback(null, 'all done.')
  }
}

function createTrackingRequest(trackingNumber, callback)
{
	var trackingRequestTemplate = fs.readFileSync("c:/node/cron/trackrequest.xml", "utf8")
	xml2js.parseString(trackingRequestTemplate, function (err, result) {
		result['soapenv:Envelope']['soapenv:Body'][0]['v9:TrackRequest'][0]['v9:SelectionDetails'][0]['v9:PackageIdentifier'][0]['v9:Value'][0] = trackingNumber
		var builder = new xml2js.Builder()
		var trackingRequest = builder.buildObject(result)
		callback(trackingRequest)
	})
}

function getTrackingStatus(xml, callback) {
	xml2js.parseString(xml, function (err, result) {
		var statusDetail = result['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['TrackReply'][0]['CompletedTrackDetails'][0]['TrackDetails'][0]['StatusDetail'][0]

		if(statusDetail.Code == null) {
			callback('NOCODESENT')
		}
		else {
			callback(statusDetail.Code[0])
		}
	})
}

function postTrackingRequest(trackingRequest, callback) {
	request({
		url: "https://ws.fedex.com:443/web-services",
		method: "POST",
		headers: {
			"content-type": "application/xml",
		},
		body: trackingRequest
	}, function (error, response, body){
		callback(response.body)
	})
}

function getUnacknowledgedTrackingNumbers(callback)
{
	sql.connect(sqlConnectionConfig, function (err) {
        if (err) console.log('getUnacknowledgedTrackingNumbers: ' + err)
        var request = new sql.Request()
		var queryString = 'Select distinct TrackingNumber from tblTaskOrderDetail tod join tblTaskOrderDetailFedexShipment todf on tod.TaskOrderDetailId = todf.TaskOrderDetailid where tod.Acknowledged = 0 and todf.TrackingNumber is not null';

        request.query(queryString, function (err, recordset) {
            if (err) console.log(err)
            callback(recordset)
        })
    })
}

function acknowledgeTask(trackingNumber, callback) {
	sql.connect(sqlConnectionConfig, function (err) {
        if (err) console.log('acknowledgeTask: ' + err)
        var request = new sql.Request()
		var now = new Date()
		var dateString = dateFormat(now, "mm/dd/yyyy h:MM:ss TT")
		console.log(dateString)
		var sqlUpdate = "Update tblTaskOrderDetail set Acknowledged = 1, AcknowledgedbyId = 5134, AcknowledgedByInitials = 'OP', AcknowledgedDate = '" + dateString + "' from tblTaskOrderDetail tod, tblTaskOrderDetailFedexShipment todf where tod.TaskOrderDetailId = todf.TaskOrderDetailId and TrackingNumber = '" + trackingNumber + "';"
		sqlUpdate += "Update tblTaskOrder set Acknowledged = 1, AcknowledgedbyId = 5134, AcknowledgedByInitials = 'OP', AcknowledgedDate = '" + dateString + "' from tblTaskOrder t, tblTaskOrderDetail tod, tblTaskOrderDetailFedexShipment todf where t.TaskOrderId = tod.TaskOrderId and tod.TaskOrderDetailId = todf.TaskOrderDetailId and todf.TrackingNumber = '" + trackingNumber + "'"

        request.query(sqlUpdate, function (err, recordset) {
            if (err) console.log(err)
            callback('Updated tracking number: ' + trackingNumber)
        })
    })
}

main()
