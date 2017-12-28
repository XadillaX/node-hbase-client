/**!
 * node-hbase-client - test/client_region.test.js
 *
 * Copyright(c) 2014 Alibaba Group Holding Limited.
 *
 * Authors:
 *   苏千 <suqian.yf@taobao.com> (http://fengmk2.github.com)
 */

"use strict";

/**
 * Module dependencies.
 */

var async = require('async');
var should = require('should');
var mm = require('mm');
var pedding = require('pedding');
var hbase = require('../');
var config = require('./config');

describe('client_region.test.js', function () {
  var client = null;
  before(function () {
    client = hbase.Client.create(config);
  });

  after(function (done) {
    setTimeout(done, 500);
  });

  afterEach(mm.restore);

  before(function (done) {
    done = pedding(2, done);
    client.putRow(config.tableUser,
      '0338472dd25d0faeacbef9b957950961',
      {'cf1:history': '0338472dd25d0faeacbef9b957950961 histry'}, done);
    client.putRow(config.tableUser,
      'fdbf2da2cc85e1c79f953a3d8f482edf',
      {'cf1:history': 'fdbf2da2cc85e1c79f953a3d8f482edf histry'}, done);
  });

  describe('processBatch()', function () {
    it('should mget from wrong region', function (done) {
      var table = config.tableUser;
      var get = new hbase.Get('0338472dd25d0faeacbef9b957950961');
      get.addColumn('cf1', 'history');

      client.processBatch(table, [get], true, 0, function (err, results) {
        should.not.exist(err);
        results.should.length(1);
        var location = client.getCachedLocation(table, get.getRow());
        mm(client, 'locateRegion', function () {
          var cb = arguments[arguments.length - 1];
          cb(null, location);
        });

        client.mget(table, ['0338472dd25d0faeacbef9b957950961', 'fdbf2da2cc85e1c79f953a3d8f482edf'], ['cf1:history'],
        function (err, results) {
          should.exist(err);
          err.name.should.equal('org.apache.hadoop.hbase.regionserver.WrongRegionException');
          done();
        });
      });
    });

    it('should batch process from wrong region', function (done) {
      var table = config.tableUser;
      var get = new hbase.Get('0338472dd25d0faeacbef9b957950961');
      get.addColumn('cf1', 'history');
      var get2 = new hbase.Get('fdbf2da2cc85e1c79f953a3d8f482edf');
      get2.addColumn('cf1', 'history');

      client.processBatch(table, [get], true, 0, function (err, results) {
        should.not.exist(err);
        results.should.length(1);
        var location = client.getCachedLocation(table, get.getRow());
        mm(client, 'locateRegion', function () {
          var cb = arguments[arguments.length - 1];
          cb(null, location);
        });

        client.processBatch(table, [get2], true, 0, function (err, results) {
          should.exist(err);
          err.name.should.equal('org.apache.hadoop.hbase.regionserver.WrongRegionException');
          done();
        });
      });
    });

    it('should mget fail first on wrong region and retry clean region caches', function (done) {
      var table = config.tableUser;
      var get = new hbase.Get('0338472dd25d0faeacbef9b957950961');
      get.addColumn('cf1', 'history');
      var get2 = new hbase.Get('fdbf2da2cc85e1c79f953a3d8f482edf');
      get2.addColumn('cf1', 'history');

      client.processBatch(table, [get], true, 0, function (err, results) {
        should.not.exist(err);
        results.should.length(1);
        var location = client.getCachedLocation(table, get.getRow());
        // console.log('location: ', location.toString());
        mm(client, 'locateRegion', function () {
          var cb = arguments[arguments.length - 1];
          mm.restore();
          cb(null, location);
        });

        client.processBatch(table, [get2], true, 0, function (err, results) {
          should.not.exist(err);
          results.should.length(1);
          done();
        });
      });
    });
  });

  it('should get rowkey from wrong region', function (done) {
    var get = new hbase.Get('0338472dd25d0faeacbef9b957950961');
    get.addColumn('cf1', 'history');
    client.get(config.tableUser, get, function (err, result) {
      should.not.exist(err);
      var kvs = result.raw();
      // if (kvs.length > 0) {
      //   for (var i = 0; i < kvs.length; i++) {
      //     var kv = kvs[i];
      //     console.log('kv: %s: %s', kv.getFamily().toString() + ':' + kv.getQualifier().toString(), kv.getValue().toString());
      //   }
      // }
      var location = client.getCachedLocation(config.tableUser, get.getRow());
      //console.log(location.toString());
      client.getRegionConnection(location.getHostname(), location.getPort(), function (err, server) {
        should.not.exist(err);

        var get2 = new hbase.Get('fdbf2da2cc85e1c79f953a3d8f482edf');
        get2.addColumn('cf1', 'history');
        server.get(location.getRegionInfo().getRegionName(), get2, function (err, result) {
          should.exist(err);
          err.name.should.equal('org.apache.hadoop.hbase.regionserver.WrongRegionException');
          should.not.exist(result);
          done();
        });
      });
    });
  });

  it('should get wrong region and retry from new region', function (done) {
    var get = new hbase.Get('0338472dd25d0faeacbef9b957950961');
    get.addColumn('cf1', 'history');
    client.get(config.tableUser, get, function (err, result) {
      should.not.exist(err);
      var kvs = result.raw();
      // if (kvs.length > 0) {
      //   for (var i = 0; i < kvs.length; i++) {
      //     var kv = kvs[i];
      //     console.log('kv: %s: %s', kv.getFamily().toString() + ':' + kv.getQualifier().toString(), kv.getValue().toString());
      //   }
      // }
      var location = client.getCachedLocation(config.tableUser, get.getRow());
      var get2 = new hbase.Get('fdbf2da2cc85e1c79f953a3d8f482edf');
      get2.addColumn('cf1', 'history');
      //console.log(location.toString());
      mm(client, 'locateRegion', function (tableName, row, useCache, callback) {
        callback(null, location);
        mm.restore();
      });
      client.get(config.tableUser, get2, function (err, result) {
        should.not.exist(err);
        should.exist(result);
        var kvs = result.raw();
        // if (kvs.length > 0) {
        //   for (var i = 0; i < kvs.length; i++) {
        //     var kv = kvs[i];
        //     console.log('kv: %s: %s', kv.getFamily().toString() + ':' + kv.getQualifier().toString(), kv.getValue().toString());
        //   }
        // }
        done();
      });
    });
  });

  it('should error when retry over 3 times', function (done) {
    var get = new hbase.Get('0338472dd25d0faeacbef9b957950961');
    get.addColumn('cf1', 'w02');
    client.get(config.tableUser, get, function (err, result) {
      should.not.exist(err);
      should.exist(result);
      var location = client.getCachedLocation(config.tableUser, get.getRow());
      var get2 = new hbase.Get('fdbf2da2cc85e1c79f953a3d8f482edf');
      get2.addColumn('cf1', 'w02');
      mm(client, 'locateRegion', function (tableName, row, useCache, callback) {
        callback(null, location);
      });
      client.get(config.tableUser, get2, function (err, result) {
        should.exist(err);
        err.name.should.equal('org.apache.hadoop.hbase.regionserver.WrongRegionException');
        should.not.exist(result);
        done();
      });
    });
  });

  it('should refused error', function (done) {
    var get = new hbase.Get('0338472dd25d0faeacbef9b957950961');
    get.addColumn('cf1', 'w02');
    client.get(config.tableUser, get, function (err, result) {
      should.not.exist(err);
      should.exist(result);
      var location = client.getCachedLocation(config.tableUser, get.getRow());
      mm(location, 'getPort', function () {
        return 64401;
      });

      var get2 = new hbase.Get('fdbf2da2cc85e1c79f953a3d8f482edf');
      get2.addColumn('cf1', 'w02');
      mm(client, 'locateRegion', function (tableName, row, useCache, callback) {
        callback(null, location);
      });
      client.get(config.tableUser, get2, function (err, result) {
        should.exist(err);
        err.name.should.equal('ConnectionRefusedException');
        should.not.exist(result);
        done();
      });
    });
  });

  describe('scan through regions', function() {
    var Scan = require('../lib/scan');

    it('should through regions', function(done) {
      var scan = new Scan();
      var rows = [];

      var count = function() {
        rows.length.should.equal(49);
        done();
      };

      client.getScanner(config.tableUser, scan, function(err, scanner) {
        var next = function() {
          scanner.next(function(err, row) {
            should.ifError(err);

            if (!row) {
              return count();
            }

            rows.push(row);
            next();
          });
        };

        next();
      });
    });

    it('should through regions with cache 10', function(done) {
      var scan = new Scan();
      scan.caching = 10;
      var rows = [];

      var count = function() {
        rows.length.should.equal(49);
        done();
      };

      client.getScanner(config.tableUser, scan, function(err, scanner) {
        var next = function() {
          scanner.next(3, function(err, ret) {
            should.ifError(err);

            if (!ret.length) {
              return count();
            }

            rows = Array.prototype.concat.apply(rows, ret);
            next();
          });
        };

        next();
      });
    });

    it('should cache even it\'s closed', function(done) {
      var scan = new Scan();
      scan.caching = 10;
      var rows = [];

      var count = function() {
        rows.length.should.equal(10);
        done();
      };

      client.getScanner(config.tableUser, scan, function(err, scanner) {
        var next = function() {
          scanner.next(function(err, row) {
            should.ifError(err);

            if (!rows.length) {
              return scanner.close(function() {
                rows.push(row);
                next();
              });
            }

            if (!row) {
              return count();
            }

            rows.push(row);
            next();
          });
        };

        next();
      });
    });

    it('should scan through regions with stop row', function(done) {
      var scan = new Scan(null, '7fffffdd');
      scan.caching = 10;
      var rows = [];

      var count = function() {
        rows.length.should.equal(24);
        done();
      };

      client.getScanner(config.tableUser, scan, function(err, scanner) {
        var next = function() {
          scanner.next(function(err, row) {
            should.ifError(err);

            if (!row) {
              return count();
            }

            rows.push(row);
            next();
          });
        };

        next();
      });
    });

    it('should scan error', function(done) {
      var scan = new Scan(null, '7fffffdd');
      scan.caching = 10;
      var rows = [];

      var count = function() {
        rows.length.should.equal(10);
        done();
      };

      var times = 0;
      client.getScanner(config.tableUser, scan, function(err, scanner) {
        var next = function() {
          scanner.next(function(err, row) {
            times++;
            if (times < 11) {
              should.ifError(err);
            } else {
              err.message.should.startWith(
                'java.io.IOException: java.lang.NoSuchMethodException: ' +
                'org.apache.hadoop.hbase.ipc.HRegionInterface.next(int, int)');
              return count();
            }

            if (!rows.length) {
              rows.push(row);
              scanner.id = -1;
              return next();
            }

            rows.push(row);
            next();
          });
        };

        next();
      });
    });

  });
});
