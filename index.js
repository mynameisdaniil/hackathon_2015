var Mandrill   = require('mandrill-api/mandrill');
var mandrill   = new Mandrill.Mandrill('Wh-XyU94VKlYMWu4Sxt_SQ');
var handlebars = require('handlebars');
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

var templateData = require('fs').readFileSync('./index.html', {encoding: 'utf8'});
var template = handlebars.compile(templateData);

var timeouts   = {};

app.use(bodyParser.json()); 

var reply = function (res, obj) {
  res.send(encode(obj) + '\n');
};

var rand_range = function (min, max) {
  return Math.random() * (max - min) + min;
};

var extend = function (obj1, obj2) {
  return Object.keys(obj2).reduce(function (obj1, key) {
    obj1[key] = obj2[key];
    return obj1;
  }, obj1);
};

var update_object = function (key, update, cb, def) {
  def = def || {};
  yaff()
    .seq(function () {
      redis.get(key, this);
    })
    .seq(function (data) {
      var obj;
      if (data)
        obj = decode(data);
      else
        obj = def;
      var updated = extend(obj, update);
      log('>>updated', updated, obj, update, data);
      redis.set(key, encode(updated), this);
    })
    .finally(cb);
};

app.post('/new', function (req, res) {
  log(req.method, req.path, req.body);
  var key = 'users:' + req.body.email;
  var id = uuid();
  yaff()
    .seq(function () {
      redis.setnx(key, id, this);
    })
    .par(function (result) {
      redis.get(key, this);
    })
    .par(function (result) {
      var that = this;
      var html = template({base: 'http://childtracker.co', id: id});
      log(html);
      if (result)
        mandrill.messages.send({
          message: {
            from_email: 'noreply@childtracker.co',
            to: [{email: req.body.email}],
            title: 'Your activation link',
            text: 'http://childtracker.co/#/activate/' + id,
            html: html
          }
        }, function () {
          log('>>', arguments);
          that();
        }, function (e) {
          log('<<', arguments);
          that(e);
        });
      else
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
  redis.set(key, encode(req.body), function (e, list) {
    if (e) {
      err(e);
      return res.sendStatus(500);
    }
    res.sendStatus(200);
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
  log(req.method, req.path, req.params.token, req.params.list_id, req.body);
  var key = 'lists:' + req.params.token + ':' + req.params.list_id;
  redis.set(key, encode(req.body), function (e, list) {
    if (e) {
      err(e);
      return res.sendStatus(500);
    }
    res.sendStatus(200);
  });
});

app.post('/:token/play/tracking', function (req, res) {
  log(req.method, req.path, req.params.token, req.body);
  var token = req.params.token;
  var diff = parseInt(req.body.time, 10);
  var now = req.body.now_watching;
  yaff()
    .par(function () {
      if (now) {
        return redis.set('session:' + token + ':now', encode(now), this);
      }
      this();
    })
    .par(function () {
      var date = Math.floor(Date.now() / 1000 / 60 / 60 / 24);
      var key = 'stats:' + token + ':' + Math.floor(Date.now() / 1000 / 60 / 60 / 24);
      if (diff)
        yaff()
          .seq(function () {
            redis.get(key, this);
          })
          .seq(function (time) {
            time = time ? decode(time):{time: 0};
            redis.set(key, encode({date: date, time: time.time + diff}), this);
          })
          .finally(this);
      else
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

app.get('/:token/play/stats', function (req, res) {
  log(req.method, req.path, req.params.token);
  var token = req.params.token;
  yaff()
    .seq(function () {
      redis.keys('stats:' + token + ':*', this);
    })
    .flatten()
    .parMap(function (key) {
      redis.get(key, this);
    })
    .map(function (item) {
      return decode(item);
    })
    .unflatten()
    .finally(function (e, list) {
      if (e) {
        err(e);
        return res.sendStatus(500);
      }
      reply(res, list);
    });
});

app.get('/:token/play/tracking', function (req, res) {
  log(req.method, req.path, req.params.token);
  var token = req.params.token;
  redis.get('session:' + token + ':now', function (e, now) {
    if (e) {
      err(e);
      return res.sendStatus(500);
    }
    if (!now)
      return reply(res, {});
    reply(res, now);
  });
});

app.post('/:token/play/control', function (req, res) {
  log(req.method, req.path, req.params.token);
  var key = 'session:' + req.params.token + ':control';
  var data = req.body;
  if (!data.timeout && timeouts[req.params.token])
    clearTimeout(timeouts[req.params.token]);
  if (data.timeout) {
    timeouts[req.params.token] = setTimeout(function () {
      update_object(key, {the_end: true}, function (e) {
        if (e)
          err(e);
      });
    }, data.timeout);
    return res.sendStatus(200);
  }
  update_object(key, req.body, function (e) {
    if (e) {
      err(e);
      return res.sendStatus(500);
    }
    res.sendStatus(200);
  }, {the_end: false});
});

app.get('/flushall', function (req, res) {
  redis.flushall(function (e) {
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
    reply(res, decode(command));
  });
});

app.listen(3000);
