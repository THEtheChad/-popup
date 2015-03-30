function Messenger(params){
    var messenger = this;

    _.extend(messenger, {
        channel: 'global',
        target: window.opener,
        subject: window,
        restrictions: '*'
    }, params);

    if(messenger.debug){
        console.groupCollapsed('Creating messenger...');
        console.log('channel:', messenger.channel);
        console.log('target:', messenger.target);
        console.log('subject:', messenger.subject);
        console.log('restrictions:', messenger.restrictions);
        console.groupEnd();
    }
}
Messenger.prototype = {
    on: function(event, fn){
        var messenger = this;
        var channel = messenger.channel;
        $(messenger.subject).on('message', function(e){
            var message = e.originalEvent.data;
            if(message.event != event) return;
            if(message.channel != channel) return;
            if(messenger.debug){
                console.groupCollapsed('Message recieved!');
                console.log('event: ', message.event);
                console.log('channel: ', message.channel);
                console.log('data: ', message.data);
                console.groupEnd();
            }
            fn(message.data);
        });
        if(messenger.debug){
            console.log('Listening for ' + event + ' on channel `' + channel + '`');
        }
    },
    send: function(event, data){
        console.log('sending:', event, data);

        this.target.postMessage({
            channel: this.channel,
            event: event,
            data: data
        }, this.restrictions);
    }
};

var Element = Backbone.Model.extend({
  initialize: function(attrs, opts){
    var element = this;
    
    element.node = opts.node;
    element.$node = opts.$node;
  },
  sync: function(){
    console.log(this, arguments)
  },
  select: function(state){
    if(state == undefined) state = !this.get('selected');

    this.set('selected', state);
  },
  highlight: function(state){
    if(state == undefined) state = !this.get('highlighted');
    if(this.get('selected') == true) state = true;

    this.set('highlighted', state);
  },
  toCsv: function(){
    var record = [];

    record.push(this.get('name'));
    record.push(this.get('preferred'));
    record.push(this.get('comment'));

    return record.join(',');
  }
});


var ElementList = Backbone.Collection.extend({
    model: Element,
    initialize: function(list, opts){
        var collection = this;

        collection.messenger = opts.messenger;

        collection.state = new Backbone.Model({
            selected_count: 0
        });

        collection.on('change:selected', function(m, selected){
            var count = collection.state.get('selected_count');

            selected ? collection.state.set('selected_count', ++count) : collection.state.set('selected_count', --count);
        });

        collection.on('reset', function(collection, changes){
            // deselect all elements
            _.each(changes.previousModels, function(element){
                element.select(false);
            });

            // reset selection count
            collection.state.set('selected_count', 0);
        });

        if(collection.messenger){
            var _recieved = [];
            function recieved(model){
                var idx = _recieved.indexOf(model.id);
                if(idx == -1) _recieved.push(model.id);
            }
            function wasRecieved(model){
                var idx = _recieved.indexOf(model.id);
                if(idx == -1) return false;

                _recieved.splice(idx, 1);
                return true;
            }

            collection.on('add', function(model){
                if(wasRecieved(model)) return;
                collection.messenger.send('element.add', model.attributes)
            });

            collection.on('remove', function(model){
                if(wasRecieved(model)) return;
                collection.messenger.send('element.remove', model.toJSON())
            });

            collection.on('change', function(model){
                if(wasRecieved(model)) return;
                collection.messenger.send('element.update', {
                    id: model.id,
                    changed: model.changed
                });
            });

            collection.messenger.on('element.add', function(node){
                recieved(node);
                collection.add(node);
            });

            collection.messenger.on('element.remove', function(node){
                recieved(node);
                collection.remove(node);
            });

            collection.messenger.on('element.update', function(message){
                var model = collection.get(message.id);
                recieved(model);
                model.set(message.changed);
            });
        }
    }
});

var ElementView = Backbone.View.extend({
  initialize: function(){
    var view = this;
    
    view.model.on('change:highlighted', function(m, state){
      view.$el.toggleClass('highlight', state);
    });
  }
});

var ElementListView = Backbone.View.extend({
  initialize: function(){
    var view = this;
  },
  target: function(selector){
    var $targets = $(selector);
    var raw = _.map($targets, nodeWithSelector(selector));
    var models = this.collection.set(raw);
    
    _.each(models, function(model, idx){
      model.view = new ElementView({
        model: model,
        el: $targets[idx]
      });
    });
  }
});

function Window(name, opts){
  if(Window.cache[name]) return Window.cache[name];
  opts = _.extend({
    name: name
  }, opts);
  
  var win = this;
  if(!(win instanceof Window)) return new Window(name, opts);

  win.rootUrl = 'http://thethechad.github.io/myers/client.html';
  win.name = name;
  
  var query = [];
  for(var k in opts){
    query.push(encodeURIComponent(k) + '=' + encodeURIComponent(opts[k]));
  }
  win.query = query.join('&');

  console.log('loading: ' + win.rootUrl + (query.length ? '?' + win.query : '') );
  
  //*
  win.window = window.open(win.rootUrl + (query.length ? '?' + win.query : ''), name, 'status=0,toolbar=0,location=0,menubar=0,scrollbars=1,directories=0,height=500,width=250');
  //*/
  win.messenger = new Messenger({
    target: win.window,
    channel: win.name,
    debug: true
  });

  Window.cache[name] = this;
}
Window.cache = {};

function Widget(name, type){
  var widget = this;
  if(!(widget instanceof Widget)) return new Widget(name, type);

  widget.window = Window(name, {type: type});
  widget.list = new ElementList([], {
    messenger: widget.window.messenger
  });
  
  widget.view = new ElementListView({
    collection: widget.list
  });
}
Widget.prototype = {
  on: function(event, fn){
    this.window.messenger.on(event, fn);
  },
  send: function(event, data){
    this.window.messenger.send(event, data);
  }
};

NodeGUID = 0;
function Node(el, selector){
  if(!(this instanceof Node)) return new Node(el, selector);

  this.tagId = el.id;
  this.tagName = el.tagName.toLowerCase();
  this.attrs = {};

  if(el.name) this.attrs.name = el.name;

  this.classNames = el.className.length ? el.className.split(' ') : [];
  this.selector = selector;
  this.highlighted = false;
  this.selected = false;

  this.id = el.guid ? el.guid : (el.guid = NodeGUID++);
}
function nodeWithSelector(selector){
	return function(el){
    return new Node(el, selector)
  }
}

var search = Widget('CSS Targeter', {type:'search'});

search.on('find', function(selector){
  search.view.target(selector);
});

/*

search.messenger.on('find', function(selector){
  console.log('selector', selector);
});

search.on('find', function(selector){
  var $targets = $(selector);

  if(!$targets.length) return;
  
	$targets.each(function(i, el){
    searchlist.add(el, null, $targets.selector);
  });
  
  //searchlist.sync();
});

function ElementList(widget){
  var self = this;
  
  self.list = [];
  self.widget = widget;
  
  widget.on('element.change', function(params){
    console.log(params)
    var element = self.find(params.id);

    if(params.data.highlighted != null){
      element.highlight(params.data.highlighted);
    }
  });
}
ElementList.prototype = {
  add: function(el, $el, selector){
    var element = new Element(this.list.length, el, $el, selector);
    this.list.push(element);
    this.widget.send('element.add', element.data);
  },
  find: function(id){
    return this.list[id];
  },
  sync: function(){
    //this.widget.send('add', this.action.add);
  }
};

*/

// 

