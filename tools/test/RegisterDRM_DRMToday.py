#!/usr/bin/env python
## DRMToday (CastLab)
##   create auth ticket tockets, list assets(keyIds), get asset by KeyID
## Examples:
## python3 "RegisterDRM_DRMToday.py" --action=login --auth=myuser --auth.password=mypwd --auth.orgname="myorg" --auth.orguid="abdd21e5-XXXX-XXXX-XXXX-XXXXXXXXXXXX" > keys_drmtoday_tickets.json
## python3 "RegisterDRM_DRMToday.py" --action=list  --auth="keys_drmtoday_tickets.json" > keys_drmtoday_dump.json
## python3 "RegisterDRM_DRMToday.py" --action=query --auth="keys_drmtoday_tickets.json" --kids="00ff00ff00ff00ff00ff00ff00ff0001" > keys_drmtoday_dump.json
##
## Aki Nieminen/Sofia Digital
## 2025-05-19/Aki: initial release

import sys, os, time, datetime, json, base64, urllib.request, urllib.error, urllib.parse
import struct  #,binascii
from optparse import OptionParser

ORG_NAME= "from cmdline"  ## Organisation name in CastLabs dashboard
ORG_UID = "from cmdline"  ## Organisation uid in CastLabs dashboard
#URL_API = "https://auth.drmtoday.com" ## production API
#URL_API2= "https://fe.drmtoday.com"
URL_API = "https://auth.staging.drmtoday.com"  ## staging API
URL_API2= "https://fe.staging.drmtoday.com"

def doLogin(username, password):
	## login and create API auth tickets(token), one per method
	jsonObj={}
	jsonObj["create"]= doLoginTicket(URL_API2+"/frontend/api/keys/v3/ingest/"+ORG_NAME, username, password)
	jsonObj["query"] = doLoginTicket(URL_API2+"/frontend/download-api/ingestion/query/v1/keys/"+ORG_UID+"/query", username, password)
	jsonObj["list"]  = doLoginTicket(URL_API2+"/frontend/download-api/ingestion/query/v1/keys/"+ORG_UID+"/download", username, password)
	return jsonObj

def doLoginTicket(serviceUrl, username, password):
	## serviceUrl: "/frontend/api/keys/v3/ingest/"
	## step 1: Login with username+password, read a ticket url from reply
	## step 2: Invoke an ticket url to create a ticket for API service (one ticket per serviceUrl?)
	url = URL_API+"/cas/v1/tickets"
	req = urllib.request.Request(url, method="POST")
	req.add_header("Content-Type", "application/x-www-form-urlencoded")

	obj={}
	try:
		obj["loginUrl"] = url
		params = { "username": username, "password": password }
		res = urllib.request.urlopen(req, data=urllib.parse.urlencode(params).encode(), timeout=60)
		buf = res.read()
		url = res.headers["Location"] ## url to be used for ticket retrieval		

		obj["ticketUrl"] = url
		obj["serviceUrl"] = serviceUrl

		params = { "service": obj["serviceUrl"] }
		req = urllib.request.Request(url, method="POST")
		req.add_header("Content-Type", "application/x-www-form-urlencoded")		
		buf = urllib.request.urlopen(req, data=urllib.parse.urlencode(params).encode(), timeout=60).read()		
		obj["ticket"] = buf.decode("UTF-8")
	except urllib.error.HTTPError as err:
		print("HTTP Error " + str(err.code))
		print(err.read().decode())
		raise err
	return obj

def doList(serviceUrl, ticket):
	url = serviceUrl+"?ticket="+ticket	
	req = urllib.request.Request(url, method="GET")
	#req.add_header("Content-Type", "application/json")
	res = urllib.request.urlopen(req, timeout=60)
	buf = res.read().decode("UTF-8")
	return json.loads(buf)

def doQuery(serviceUrl, ticket, kids):
	url = serviceUrl+"?ticket="+ticket	
	req = urllib.request.Request(url, method="POST")
	req.add_header("Content-Type", "application/json")
	params={ "keyIds": kids } ## 1..N KeyIDs
	res = urllib.request.urlopen(req, data=json.dumps(params).encode(), timeout=60)
	buf = res.read().decode("UTF-8")
	return json.loads(buf)

def doCreate(serviceUrl, ticket, assetId, key0, key1):
	## key0="KeyID,EncKey" comma delimited
	url = serviceUrl+"?ticket="+ticket	
	#url = "http://localhost:8180/debug.jsp?path="
	req = urllib.request.Request(url, method="POST")
	req.add_header("Content-Type", "application/json")
	params={ "assets": [{}], "signaling":{} } 
	params["assets"][0]["assetId"]=assetId
	params["assets"][0]["overwriteExistingKeys"]=True
	params["assets"][0]["ingestKeys"]=[{},{}] ## init separate VIDEO and AUDIO keys
	
	keyIdx=0
	kidKey=key0.split(",")
	params["assets"][0]["ingestKeys"][keyIdx]["streamType"]="VIDEO"
	params["assets"][0]["ingestKeys"][keyIdx]["keyId"]     =base64.b64encode(bytearray.fromhex(kidKey[0])).decode("ISO-8859-1")
	params["assets"][0]["ingestKeys"][keyIdx]["key"]       =base64.b64encode(bytearray.fromhex(kidKey[1])).decode("ISO-8859-1")
	params["assets"][0]["ingestKeys"][keyIdx]["clearKey"]  =True ## use False for production keys
	#params["assets"][0]["ingestKeys"][keyIdx]["iv"]="" ## IV for FairPlay

	keyIdx=keyIdx+1
	kidKey=key1.split(",")
	params["assets"][0]["ingestKeys"][keyIdx]["streamType"]="AUDIO"
	params["assets"][0]["ingestKeys"][keyIdx]["keyId"]     =base64.b64encode(bytearray.fromhex(kidKey[0])).decode("ISO-8859-1")
	params["assets"][0]["ingestKeys"][keyIdx]["key"]       =base64.b64encode(bytearray.fromhex(kidKey[1])).decode("ISO-8859-1")
	params["assets"][0]["ingestKeys"][keyIdx]["clearKey"]  =True ## use False for production keys
	#params["assets"][0]["ingestKeys"][keyIdx]["iv"]="" ## IV for FairPlay	
	
	params["signaling"]["level"] = "all"
	params["signaling"]["enc"]   = ["cenc"] ## cenc,cbcs
	params["signaling"]["system"]= [ "9a04f079-9840-4286-ab92-e65be0885f95", "edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" ] ## use playrady,widevine or "all"
	
	res = urllib.request.urlopen(req, data=json.dumps(params).encode(), timeout=60)
	buf = res.read().decode("UTF-8")
	return json.loads(buf)
		
#################################
#################################

def main():
	## parse command line arguments
	parser = OptionParser(add_help_option=False)
	parser.add_option("-h", "--help", action="help")
	parser.add_option("--auth", type="string", dest="auth", default="", help="Authentication username or tickets.json file")
	parser.add_option("--auth.password", type="string", dest="authPwd", default="", help="Authentication password for login")
	parser.add_option("--auth.orgname", type="string", dest="authOrgName", default="", help="Authentication organisation name")
	parser.add_option("--auth.orguid", type="string", dest="authOrgUid", default="", help="Authentication organisation uid")
	parser.add_option("--action", type="string", dest="action", default="get", help="Action (login, list, query)")
	parser.add_option("--kids", type="string", dest="kids", default="", help="KeyIDs, comma delimited list")
	parser.add_option("--asset", type="string", dest="asset", default="", help="Asset id for KeyId")
	parser.add_option("--key0", type="string", dest="key0", default="", help="KeyId,EncKey")
	parser.add_option("--key1", type="string", dest="key1", default="", help="KeyId,EncKey")
	(options, args) = parser.parse_args()

	#now = datetime.datetime.utcnow()

	global ORG_NAME, ORG_UID ## init global variables
	ORG_NAME = options.authOrgName
	ORG_UID  = options.authOrgUid
	
	if options.action == "login":
		## cmdline outputs response to "keys_drmtoday_tickets.json" file
		jsonObj = doLogin(options.auth, options.authPwd)
		print( json.dumps(jsonObj, indent=2, sort_keys=False, ensure_ascii=False) )
		return
		
	elif options.action == "list":
		## list all KeyIDs
		jsonTickets=None
		with open("keys_drmtoday_tickets.json", "r") as file: jsonTickets = json.load(file)
		jsonObj = doList( jsonTickets["list"]["serviceUrl"], jsonTickets["list"]["ticket"] )
		print( json.dumps(jsonObj, indent=2, sort_keys=False, ensure_ascii=False) )

	elif options.action == "query":
		## Query 1..N KeyIDs
		jsonTickets=None
		with open("keys_drmtoday_tickets.json", "r") as file: jsonTickets = json.load(file)
		jsonObj = doQuery( jsonTickets["query"]["serviceUrl"], jsonTickets["query"]["ticket"], options.kids.split(",") )
		print( json.dumps(jsonObj, indent=2, sort_keys=False, ensure_ascii=False) )

	elif options.action == "create":
		## Register KeyId+EncKey
		jsonTickets=None
		with open("keys_drmtoday_tickets.json", "r") as file: jsonTickets = json.load(file)
		jsonObj = doCreate( jsonTickets["create"]["serviceUrl"], jsonTickets["create"]["ticket"], options.asset, options.key0, options.key1 )
		print( json.dumps(jsonObj, indent=2, sort_keys=False, ensure_ascii=False) )

	return 0

if __name__ == "__main__":
	main()
