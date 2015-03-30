function Messenger(params){
  _.extend(this, {
    channel: 'global',
    target: window.opener,
    subject: window,
    restrictions: '*'
  }, params);
}
Messenger.prototype = {
  on: function(event, fn){
    var channel = this.channel;
    $(this.subject).on('message', function(e){
      var message = e.originalEvent.data;
      console.log('message recieved\n---\nevent: ' + message.event + '\nchannel: ' + message.channel + '\nlistening: ' + channel + '\ndata:', message.data);
      if(message.event != event) return;
      if(message.channel != channel) return;
      fn(message.data);
    });
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
  initialize: function(attrs){
    var element = this;
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
        var recieved = false;

        collection.on('add', function(model){
            if(recieved) return recieved = false;
            collection.messenger.send('element.add', model.attributes)
        });

        collection.on('remove', function(model){
            if(recieved) return recieved = false;
            collection.messenger.send('element.remove', model.toJSON())
        });

        collection.on('change', function(model){
            if(recieved) return recieved = false;
            collection.messenger.send('element.update', {
                id: model.id,
                changed: model.changed
            });
        });

        collection.messenger.on('element.add', function(node){
            recieved = true;
            collection.add(node);
        });

        collection.messenger.on('element.remove', function(node){
            recieved = true;
            collection.remove(node);
        });

        collection.messenger.on('element.update', function(message){
            recieved = true;
            collection.get(message.id).set(message.changed);
        });
    }
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

  console.log('loading ' + win.rootUrl + (query.length ? '?' + win.query : '') );
  
  //*
  win.window = window.open(win.rootUrl + (query.length ? '?' + win.query : ''), name, 'status=0,toolbar=0,location=0,menubar=0,scrollbars=1,directories=0,height=500,width=250');
  //*/
  win.messenger = new Messenger({
    target: win.window,
    channel: win.name
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
}

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
