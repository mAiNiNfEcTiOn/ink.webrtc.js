/**
 * @module Ink.UI.WebRTC_1
 * @author inkdev AT sapo.pt
 * @version 1
 */
Ink.createModule('Ink.UI.WebRTC', '1', ['Ink.Dom.Event_1','Ink.Dom.Selector_1','Ink.Dom.Element_1','Ink.UI.Aux_1'], function(Event, Selector, Element, Aux) {
    'use strict';

    /**
     * WebRTC.org's adapter.js
     *
     * Polyfills
     */
    var RTCPeerConnection = null;
    var getUserMedia = null;
    var attachMediaStream = null;
    var reattachMediaStream = null;
    var webrtcDetectedBrowser = null;
    var webrtcDetectedVersion = null;
    var sdpConstraints = {
      'mandatory': {
          'OfferToReceiveAudio': true,
          'OfferToReceiveVideo': true
      }
    };

    window.trace = function(text) {
      // This function is used for logging.
      if (text[text.length - 1] == '\n') {
        text = text.substring(0, text.length - 1);
      }
      console.log((performance.now() / 1000).toFixed(3) + ": " + text);
    }

    if (navigator.mozGetUserMedia) {
      // console.log("This appears to be Firefox");

      window.webrtcDetectedBrowser = "firefox";

      window.webrtcDetectedVersion = parseInt(navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1]);

      // The RTCPeerConnection object.
     window.RTCPeerConnection = mozRTCPeerConnection;

      // The RTCSessionDescription object.
      window.RTCSessionDescription = mozRTCSessionDescription;

      // The RTCIceCandidate object.
      window.RTCIceCandidate = mozRTCIceCandidate;

      // Get UserMedia (only difference is the prefix).
      // Code from Adam Barth.
      window.getUserMedia = navigator.mozGetUserMedia.bind(navigator);

      // Creates iceServer from the url for FF.
      window.createIceServer = function(url, username, password) {
        var iceServer = null;
        var url_parts = url.split(':');
        if (url_parts[0].indexOf('stun') === 0) {
          // Create iceServer with stun url.
          iceServer = { 'url': url };
        } else if (url_parts[0].indexOf('turn') === 0 &&
                   (url.indexOf('transport=udp') !== -1 ||
                    url.indexOf('?transport') === -1)) {
          // Create iceServer with turn url.
          // Ignore the transport parameter from TURN url.
          var turn_url_parts = url.split("?");
          iceServer = { 'url': turn_url_parts[0],
                        'credential': password,
                        'username': username };
        }
        return iceServer;
      };

      // Attach a media stream to an element.
      window.attachMediaStream = function(element, stream) {
        // console.log("Attaching media stream");
        element.mozSrcObject = stream;
        element.play();
      };

      window.reattachMediaStream = function(to, from) {
        // console.log("Reattaching media stream");
        to.mozSrcObject = from.mozSrcObject;
        to.play();
      };

      // Fake get{Video,Audio}Tracks
      window.MediaStream.prototype.getVideoTracks = function() {
        return [];
      };

      window.MediaStream.prototype.getAudioTracks = function() {
        return [];
      };
    } else if (navigator.webkitGetUserMedia) {
      console.log("This appears to be Chrome");

      window.webrtcDetectedBrowser = "chrome";
      window.webrtcDetectedVersion = parseInt(navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)[2]);

      // Creates iceServer from the url for Chrome.
      window.createIceServer = function(url, username, password) {
        var iceServer = null;
        var url_parts = url.split(':');
        if (url_parts[0].indexOf('stun') === 0) {
          // Create iceServer with stun url.
          iceServer = { 'url': url };
        } else if (url_parts[0].indexOf('turn') === 0) {
          if (webrtcDetectedVersion < 28) {
            // For pre-M28 chrome versions use old TURN format.
            var url_turn_parts = url.split("turn:");
            iceServer = { 'url': 'turn:' + username + '@' + url_turn_parts[1],
                          'credential': password };
          } else {
            // For Chrome M28 & above use new TURN format.
            iceServer = { 'url': url,
                          'credential': password,
                          'username': username };
          }
        }
        return iceServer;
      };

      // The RTCPeerConnection object.
      window.RTCPeerConnection = webkitRTCPeerConnection;

      // Get UserMedia (only difference is the prefix).
      // Code from Adam Barth.
      window.getUserMedia = navigator.webkitGetUserMedia.bind(navigator);

      // Attach a media stream to an element.
      window.attachMediaStream = function(element, stream) {
        if (typeof element.srcObject !== 'undefined') {
          element.srcObject = stream;
        } else if (typeof element.mozSrcObject !== 'undefined') {
          element.mozSrcObject = stream;
        } else if (typeof element.src !== 'undefined') {
          element.src = URL.createObjectURL(stream);
        } else {
          console.log('Error attaching stream to element.');
        }
      };

      window.reattachMediaStream = function(to, from) {
        to.src = from.src;
      };

      // The representation of tracks in a stream is changed in M26.
      // Unify them for earlier Chrome versions in the coexisting period.
      if (!webkitMediaStream.prototype.getVideoTracks) {
        window.webkitMediaStream.prototype.getVideoTracks = function() {
          return this.videoTracks;
        };
        window.webkitMediaStream.prototype.getAudioTracks = function() {
          return this.audioTracks;
        };
      }

      // New syntax of getXXXStreams method in M26.
      if (!webkitRTCPeerConnection.prototype.getLocalStreams) {
        window.webkitRTCPeerConnection.prototype.getLocalStreams = function() {
          return this.localStreams;
        };
        window.webkitRTCPeerConnection.prototype.getRemoteStreams = function() {
          return this.remoteStreams;
        };
      }
    } else {
      throw "Browser does not appear to be WebRTC-capable";
    }

    window.preferOpus = function(sdp) {
        var sdpLines = sdp.split('\r\n');

        // Search for m line.
        for (var i = 0; i < sdpLines.length; i++) {
            if (sdpLines[i].search('m=audio') !== -1) {
                var mLineIndex = i;
                break;
            }
        }
        if (mLineIndex === null) return sdp;

        // If Opus is available, set it as the default in m line.
        for (var i = 0; i < sdpLines.length; i++) {
            if (sdpLines[i].search('opus/48000') !== -1) {
                var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
                if (opusPayload) sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
                break;
            }
        }

        // Remove CN in m line and sdp.
        sdpLines = removeCN(sdpLines, mLineIndex);

        sdp = sdpLines.join('\r\n');
        return sdp;
    };

    window.extractSdp = function(sdpLine, pattern) {
        var result = sdpLine.match(pattern);
        return (result && result.length == 2) ? result[1] : null;
    };

    // Set the selected codec to the first in m line.
    window.setDefaultCodec = function(mLine, payload) {
        var elements = mLine.split(' ');
        var newLine = new Array();
        var index = 0;
        for (var i = 0; i < elements.length; i++) {
            if (index === 3) // Format of media starts from the fourth.
            newLine[index++] = payload; // Put target payload to the first.
            if (elements[i] !== payload) newLine[index++] = elements[i];
        }
        return newLine.join(' ');
    };

    // Strip CN from sdp before CN constraints is ready.
    window.removeCN = function(sdpLines, mLineIndex) {
        var mLineElements = sdpLines[mLineIndex].split(' ');
        // Scan from end for the convenience of removing an item.
        for (var i = sdpLines.length - 1; i >= 0; i--) {
            var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
            if (payload) {
                var cnPos = mLineElements.indexOf(payload);
                if (cnPos !== -1) {
                    // Remove CN payload from m line.
                    mLineElements.splice(cnPos, 1);
                }
                // Remove CN line in sdp
                sdpLines.splice(i, 1);
            }
        }

        sdpLines[mLineIndex] = mLineElements.join(' ');
        return sdpLines;
    };

    window.mergeConstraints = function(cons1, cons2) {
        var merged = cons1;
        for (var name in cons2.mandatory) {
            merged.mandatory[name] = cons2.mandatory[name];
        }
        merged.optional.concat(cons2.optional);
        return merged;
    };
    /**
     * ##### End of Polyfills
     */


    /**
     * Signaling
     *
     * @param {Object} options [description]
     */
    var Signaling = function( options ){

      this._options = options || {};

      this._initializedStreams = 0;
      this._numStreams = 0;
      this._socket = null;
      this._events = {};
      this._peerConnections = {};
      this._connections = [];
      this._streams = [];

      this._init();

    };

    Signaling.prototype = {
      _init: function(){
        this._socket = new WebSocket( this._options.server );

        this._socket.onopen = Ink.bind(function(){
          console.log('Connected to the Signaling Server');
          this._socket.send(JSON.stringify({
            eventName: 'join_room',
            data: {
              room: this._options.roomName
            }
          }));

          // Function that runs when you get the already present connections in the Signaling Server
          this.on( 'get_peers', Ink.bind(function( eventData ){
            this._connections = eventData.connections;
            this.fire('connections',this._connections);
          },this));

          // Function that runs whenever you receive an Ice Candidate
          this.on( 'receive_ice_candidate', Ink.bind(function( eventData ){
            var candidate = new window.RTCIceCandidate({
              // sdpMLineIndex: eventData.socketId,
              sdpMLineIndex: 1,
              candidate: eventData.candidate
            });
            this._peerConnections[eventData.socketId].addIceCandidate( candidate );
            this.fire('receive ice candidate',candidate);

          },this));

          // Function that runs whenever there's a new connection to the Signaling Server
          this.on( 'new_peer_connected', Ink.bind(function( eventData ){
            // this._connections.push( eventData.socketId );
            var pc = this._createRTCPeerConnection( eventData.socketId );

            for (var i = 0; i < this._streams.length; i++) {
              var stream = this._streams[i];
              pc.addStream(stream);
            }
          },this));

          // Function that runs whenever a remote peer disconnects
          this.on( 'remove_peer_connected', Ink.bind(function( eventData ){
            delete this._peerConnections[eventData.socketId];
            this.fire('disconnect stream',eventData.socketId);
          },this));

          // Function that runs whenever a remote peer disconnects
          this.on( 'receive_offer', Ink.bind(function( eventData ){
            console.log("Offer received");
            this._receiveOffer( eventData.socketId, eventData.sdp );
            this.fire('receive offer',eventData);
          },this));

          this.on('receive_answer', Ink.bind(function(eventData) {
            console.log("Answer received");
            this._receiveAnswer(eventData.socketId, eventData.sdp);
            this.fire('receive answer', eventData);
          },this));

          this.fire('connect');

        },this);

        this._socket.onmessage = Ink.bindEvent(function( event ){
          var message = JSON.parse( event.data );
          this.fire( message.eventName, message.data );
        }, this);

        this._socket.onerror = function( err ){
          console.error("Error in the communication with the Signaling Server: ", err);
        };

        this._socket.onclose = Ink.bindEvent(function(data){
          console.log("The connection to the Signaling Server was closed!");
          this.fire('disconnect stream', this._socket.id);
          delete this._peerConnections[this._socket.id];
        },this);
      },

      on: function( eventName, eventCallback ){
        this._events[eventName] = eventCallback;
      },

      fire: function( eventName, _ ){
        if( !(eventName in this._events)){
          return;
        }
        var eventData = Array.prototype.slice.call(arguments, 1);
        this._events[eventName].apply(this,eventData);
      },

      _createRTCPeerConnections: function(){
        for (var i = 0; i < this._connections.length; i++) {
          this._createRTCPeerConnection(this._connections[i]);
        }
      },

      _createRTCPeerConnection: function( id ){
        console.log( "Creating a new PeerConnection" );
	if (window.webrtcDetectedBrowser === 'chrome'){
          var pc = this._peerConnections[id] = new window.RTCPeerConnection( this._options.RTCPeerConnectionServer, {
            "optional": [{
                "DtlsSrtpKeyAgreement": true
            }]
          });
	} else {
	  var pc = this._peerConnections[id] = new window.RTCPeerConnection( this._options.RTCPeerConnectionServer, {});
	}

        pc.onicecandidate = Ink.bindEvent(function( event ){
          if( event.candidate ){
            this._socket.send(JSON.stringify({
              eventName: 'send_ice_candidate',
              data: {
                candidate: event.candidate.candidate,
                socketId: id
              }
            }));
          }

          this.fire( 'ice candidate' );
        },this);

        pc.onopen = Ink.bindEvent(function(){
          this.fire( 'peer connection opened' );
        },this);

        pc.onaddstream = Ink.bindEvent(function( event ){
          this.fire( 'add remote stream', event.stream, id );
        },this);

        console.log( "PeerConnection created with the id: ", id  );

        return pc;
      },

      _receiveOffer: function( socketId, sdp ){
        var pc = this._peerConnections[socketId];
	if (window.webrtcDetectedBrowser === 'chrome'){
          pc.setRemoteDescription(new window.RTCSessionDescription(sdp));
	} else {
          pc.setRemoteDescription(sdp);
	}
        this._sendAnswer(socketId);
      },

      _sendAnswer: function(socketId) {
        var pc = this._peerConnections[socketId];
        pc.createAnswer(Ink.bind(function(session_description) {
          session_description.sdp = preferOpus(session_description.sdp);
          pc.setLocalDescription(session_description);
          this._socket.send(JSON.stringify({
            "eventName": "send_answer",
            "data": {
              "socketId": socketId,
              "sdp": session_description
            }
          }));
        },this));
      },

      _receiveAnswer: function( socketId, sdp ){
        var pc = this._peerConnections[socketId];
        if (window.webrtcDetectedBrowser === 'chrome'){
          pc.setRemoteDescription(new window.RTCSessionDescription(sdp));
        } else {
          pc.setRemoteDescription(sdp);
        }
      },

      _sendOffers: function(){
        for (var i = 0, len = this._connections.length; i < len; i++) {
            var socketId = this._connections[i];
            this._sendOffer(socketId);
        }
      },

      _sendOffer: function(socketId) {
        var pc = this._peerConnections[socketId];

        var constraints = {
            "optional": [],
            "mandatory": {
                "MozDontOfferDataChannel": true
            }
        };
        // temporary measure to remove Moz* constraints in Chrome
        if (window.webrtcDetectedBrowser === "chrome") {
            for (var prop in constraints.mandatory) {
                if (prop.indexOf("Moz") != -1) {
                    delete constraints.mandatory[prop];
                }
            }
        }


        constraints = window.mergeConstraints(constraints, sdpConstraints);
        pc.createOffer(Ink.bind(function(session_description) {
          session_description.sdp = preferOpus(session_description.sdp);
          pc.setLocalDescription(session_description);
          this._socket.send(JSON.stringify({
            "eventName": "send_offer",
            "data": {
              "socketId": socketId,
              "sdp": session_description
            }
          }));
        },this),null, constraints);
      },

      _onClose: function( eventData ){
        this.on('close_stream', function() {
          this.fire('close_stream', eventData);
        });
      },

      _addStreams: function() {
        for (var i = 0; i < this._streams.length; i++) {
          var stream = this._streams[i];
          for (var connection in this._peerConnections) {
            this._peerConnections[connection].addStream(stream);
          }
        }
      },

      _attachStream: function(stream, domId) {
        window.attachMediaStream(document.getElementById(domId), stream);
      }
    };


    /**
     * @class Ink.UI.WebRTC
     * @constructor
     * @version 1
     * @uses Ink.Dom.Event
     * @uses Ink.Dom.Selector
     * @uses Ink.Dom.Element
     * @uses Ink.UI.Aux
     *
     * @param {String|DOMElement} selector
     * @param {Object} [options] Options
     *      @param {String}   [options.instance]         unique id for the datepicker
     *
     * @example
     *     TODO - Example
     */
    var WebRTC = function(options) {

        /**
         * Setting the configuration options to be working with.
         * @type {Object}
         */
        this._options = Ink.extendObj({
            roomName: 'room'+Math.floor(Math.random()*6000),
            signalingServer: 'ws://198.211.126.126:8080',
            stunServers: [
                'stun.l.google.com:19302' // ,'stun1.l.google.com:19302','stun2.l.google.com:19302',
                // 'stun3.l.google.com:19302','stun4.l.google.com:19302','stun01.sipphone.com',
                // 'stun.ekiga.net','stun.fwdnet.net','stun.ideasip.com','stun.iptel.org',
                // 'stun.rixtelecom.se','stun.schlund.de','stunserver.org','stun.softjoys.com',
                // 'stun.voiparound.com','stun.voipbuster.com','stun.voipstunt.com','stun.voxgratia.org',
                // 'stun.xten.com'
            ],
            turnServers: [
                //{url: 'numb.viagenie.ca', username: 'pt.n00b@gmail.com', credential: 'canoagem'}
            ],
            audioShare: true,
            videoShare: true,

            localVideoElm: undefined,
            remoteVideoElm: undefined

        }, options || {});


        this._streams = [];


        this._socket = null;
        this._iceConfig = {
            "iceServers":[]
        };

        this._signalingSocket = new Signaling({
          server: this._options.signalingServer,
          roomName: this._options.roomName,
          RTCPeerConnectionServer: this._iceConfig
        });

        this._init();
    };

    WebRTC.prototype = {

        /**
         * Initialization function.
         *
         * @method _init
         * @private
         */
        _init: function(){
            trace("Requesting local stream");

            for( var index in this._options.stunServers ){
                this._iceConfig.iceServers.push( createIceServer("stun:"+this._options.stunServers[index] ));
            }
            for( var index in this._options.turnServers ){
                this._iceConfig.iceServers.push( createIceServer("turn:"+this._options.turnServers[index].url,this._options.turnServers[index].username, this._options.turnServers[index].credential) );
            }

            // Get local stream
            this._signalingSocket._numStreams += 1;
            window.getUserMedia({audio:this._options.audioShare, video:this._options.videoShare}, Ink.bind(this._myStreamReceived,this), function() { throw 'Could not connect to your audio/video.'; });
        },

        // Bind local stream to video element
        _myStreamReceived: function( stream ){

          this._signalingSocket.on('add remote stream', Ink.bind(function(stream, socketId) {
              window.attachMediaStream(Ink.i('remote'),stream);
          },this._signalingSocket));


          this._signalingSocket.on('ready', Ink.bind(function(){
            console.log("Signaling is ready!");
            this._createRTCPeerConnections();
            this._addStreams();
            this._sendOffers();
          },this._signalingSocket));

          this._signalingSocket._streams.push( stream );
          this._signalingSocket._initializedStreams++;
          if (this._signalingSocket._initializedStreams === this._signalingSocket._numStreams) {
            this._signalingSocket.fire('ready');
          }
          window.attachMediaStream(document.getElementById('local'), stream);

        }
    };

    return WebRTC;

});
































