var sendgrid   = require('sendgrid')('UeeGQOnfRbiUOSCU6cJ-DA');
var express    = require('express');
var bodyParser = require('body-parser');
var uuid       = require('uuid').v4;
var redis      = require('redis').createClient();
var yaff       = require('yaff');
var app        = express();
var log        = console.log;
var err        = console.error;
var encode     = JSON.stringify;
var decode     = JSON.parse;

app.use(bodyParser.json()); 

var reply = function (res, obj) {
  res.send(encode(obj) + '\n');
};

var yt_movie = function () {
  return {
    id: 'e21aad67-a7f6-4ed1-9a8a-ced76188fe56',
    thumbnails: {
      somekey: {
        url: 'http://ya.ru',
        width: 100,
        height: 500
      },
      another_key: {
        url: '',
        width: 800,
        height: 600
      }
    },
    title: 'Hello there',
    description: 'ololo trololo lalala',
    channel: 'OLOLO',
    etag: '15-3JQVFLwoG6yepWGqlDPA/A'
  };
};

var yt_list = function () {
  return {
    title: 'lalala',
    url: 'http://',
    id: 'e21aad67-a7f6-4ed1-9a8a-ced76188fe56',
    enabled: true
  };
};
 
app.post('/new', function (req, res) {
  log(req.method, req.path, req.body);
  var key = 'users:' + req.body.email;
  yaff()
    .seq(function () {
      redis.setnx(key, uuid(), this);
    })
    .seq(function (result) {
      if (result === 0)
        return redis.get(key, this);
      this();
    })
    .finally(function (e, token) {
      if (e)
        return res.sendStatus(500);
      reply(res, {token: token});
      log(arguments);
    });
});
 
app.get('/:token/lists', function (req, res) {
  log(req.method, req.path, req.params.token);
  var key = 'lists:' + req.params.token;
  redis.get(key, function (e, list) {
    if (e) {
      err(e);
      return res.sendStatus(500);
    }
    if (!list)
      return reply(res, []);
    reply(res, decode(list));
  });
});

app.post('/:token/lists', function (req, res) {
  log(req.method, req.path, req.params.token, req.body);
  var key = 'lists:' + req.params.token;
  redis.set(key, req.body, function (e, list) {
    if (e) {
      err(e);
      return res.sendStatus(500);
    }
    reply(res, decode(list));
  });
});

app.get('/:token/lists/:list_id', function (req, res) {
  log(req.method, req.path, req.params.token, req.params.list_id);
  var key = 'lists:' + req.params.token + ':' + req.params.list_id;
  redis.get(key, function (e, list) {
    if (e) {
      err(e);
      return res.sendStatus(500);
    }
    if (!list)
      return reply(res, []);
    reply(res, decode(list));
  });
});

app.post('/:token/lists/:list_id', function (req, res) {
  log(req.method, req.path, req.params.token, req.params.list_id);
  var key = 'lists:' + req.params.token + ':' + req.params.list_id;
  redis.set(key, req.body, function (e, list) {
    if (e) {
      err(e);
      return res.sendStatus(500);
    }
    reply(res, decode(list));
  });
});

app.post('/:token/play/tracking', function (req, res) {
  log(req.method, req.path, req.params.token);
  var token = req.params.token;
  var data = decode(req.body);
  var time = data.time;
  var now = data.now_watching;
  yaff()
    .par(function () {
      redis.set('session:' + token + ':now', now, this);
    })
    .par(function () {
      // redis.add('');
      this();
    })
    .finally(function (e) {
      if (e) {
        err(e);
        return res.sendStatus(500);
      }
      reply(res, {the_end: false});
    });
});

app.post('/:token/play/control', function (req, res) {
  log(req.method, req.path, req.params.token);
  var key = 'session:' + req.params.token + ':control';
  redis.set(key, encode(req.body), function (e) {
    if (e) {
      err(e);
      return res.sendStatus(500);
    }
    res.sendStatus(200);
  });
});

app.get('/:token/play/control', function (req, res) {
  log(req.method, req.path, req.params.token);
  var key = 'session:' + req.params.token + ':control';
  redis.get(key, function (e, command) {
    if (e) {
      err(e);
      return res.sendStatus(500);
    }
    log('command:', command);
    if (!command)
      return reply(res, {the_end: false});
    reply(res, command);
  });
});

app.listen(3000);