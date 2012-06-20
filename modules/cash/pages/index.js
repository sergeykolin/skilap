var async = require("async");
var _ = require('underscore');

module.exports = function account(webapp) {
	var app = webapp.web;
	var cashapi = webapp.api;
	var prefix = webapp.prefix
	var assetsTypes = ["BANK", "CASH", "ASSET", "STOCK", "MUTUAL", "CURENCY"];
	var liabilitiesTypes = ["CREDIT", "LIABILITY", "RECEIVABLE", "PAYABLE"];
	var repCmdty = {space:"ISO4217",id:"RUB"};
	
	function getAssets(token, id, types, data, cb) {
		// filter this level data
		var level = _(data.accounts).filter(function (e) { return e.parentId == id && _(types).include(e.type); });
		var res = [];
		_(level).forEach (function (acc) {
			var det = {};
			det.cmdty = acc.cmdty;
			det.name = acc.name;
			det.id = acc.id;			
			getAssets(token, acc.id,types,data, function (err,childs) {
				if (err) return cb(err);
				if (!_(repCmdty).isEqual(det.cmdty)) 
					det.quantity = acc.value;
				var rate = 1;
				var r = _(data.cmdty).find(function (e) { return e.id==acc.cmdty.id });
				if (r!=null)
					rate = r.rate;
				det.value = parseFloat(webapp.i18n_cmdtyval(det.cmdty.id,acc.value*rate));
				det.childs = childs;
				_(childs).forEach (function (e) {
					det.value+=e.value;
				})
				det.fvalue = webapp.i18n_cmdtytext(token,repCmdty,det.value);
				if (det.quantity)
					det.fquantity = webapp.i18n_cmdtytext(token,det.cmdty,det.quantity);
				res.push(det);
			})
		})
		cb(null, res);
	}

	app.get(prefix, function(req, res, next) {
		var data;
		var assets = [];
		var liabilities = [];
		async.waterfall([
			function (cb) {
				var batch = {
					"setup":{
						"cmd":"object",
						"prm":{"token":req.session.apiToken,"repCmdty":repCmdty},
						"res":{"a":"merge"}
					},
					"accounts":{
						"dep":"setup",
						"cmd":"api",
						"prm":["cash.getAllAccounts","token"],
						"res":{"a":"store","v":"accounts"}
					},
					"filter":{
						"dep":"accounts",
						"cmd":"filter",
						"prm":["accounts","type",["BANK", "CASH", "ASSET", "STOCK", "MUTUAL", "CURENCY","CREDIT", "LIABILITY", "RECEIVABLE", "PAYABLE"],"IN"],
						"res":{"a":"store","v":"accounts"}
					},					
					"info":{
						"dep":"filter",
						"cmd":"api",
						"ctx":{"a":"each","v":"accounts"},
						"prm":["cash.getAccountInfo","token","id",["value"]],
						"res":{"a":"merge"}
					},
					"cmdty":{
						"dep":"filter",
						"cmd":"pluck",
						"prm":["accounts","cmdty","unique"],
						"res":{"a":"clone","v":"cmdty"}
					},
					"rates":{
						"dep":"cmdty",
						"cmd":"api",
						"ctx":{"a":"each","v":"cmdty"},	
						"prm":["cash.getCmdtyPrice","token","this","repCmdty",null,null],
						"res":{"a":"store","v":"rate"}
					}					
				}
				
				webapp.ctx.runBatch(batch,function (err, _data) {
					if (err) return cb(err);
					data = _data;
					cb();
				})
			},
			function (cb) { 
				getAssets(req.session.apiToken, 0, assetsTypes, data, function (err, res) {
					if (err) return cb(err);
					assets = res;
					cb();
				})
			},
			function (cb) { 
				getAssets(req.session.apiToken, 0, liabilitiesTypes, data, function (err, res) {
					if (err) return cb(err);
					liabilities = res;
					cb();
				})
			},
			function (cb) { webapp.guessTab(req, {pid:'home',name:'Home',url:req.url}, cb) },
			function render (vtabs) {
				var rdata = {settings:{views:__dirname+"/../views"},prefix:prefix, tabs:vtabs};
				rdata.assetsSum = webapp.i18n_cmdtytext(req.session.apiToken,repCmdty,_(assets).reduce(function (m,e) {return m+e.value;},0));
				rdata.liabilitiesSum = webapp.i18n_cmdtytext(req.session.apiToken,repCmdty,_(liabilities).reduce(function (m,e) {return m+e.value;},0));
				rdata.assets = assets;
				rdata.liabilities = liabilities;
				
				res.render(__dirname+"/../views/index", rdata);
			}],
			next
		);
	});

	app.get(prefix + "/close", function(req, res, next) {
		async.waterfall([
			function(cb1){
				var pid = req.query.pid;
				if (pid) {
					webapp.removeTabs(req.session.apiToken, [pid], cb1);
				} else {
					cb1();
				}
			},
			function(){
				res.writeHead(200, {'Content-Type': 'text/plain'});
				res.end('true');
			}
		], next);
	})
}
