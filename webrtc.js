var webrtc = (function(parent, global) {
  let mHtml5VideoElement1;
  let mHtml5VideoElement2;
  let mHtml5VideoElement3;
  let mHtml5VideoElement4;
  let mWebsocketConnection;
  let mWebrtcPeerConnection;
  let mWebrtcConfiguration;
  let mReportError;
  let mSendDataChannel;
  let mRecvDataChannelCallback;

  /**
   * SDP の設定を接続先に送り返す。
   * 
   * @param {*} desc 
   */
  function onLocalDescription(desc) { 
    // console.log("Local description: " + JSON.stringify(desc));
    mWebrtcPeerConnection.setLocalDescription(desc).then(function() { 
      mWebsocketConnection.send(JSON.stringify({
        'type': 'sdp', 
        'data': mWebrtcPeerConnection.localDescription
      }));
    }).catch(mReportError);
  } 

  /**
   * Websocket から SDP の設定が渡されてきた場合に呼び出される。
   * 
   * 送られてきた接続先の SDP の設定を WebRTC に設定する。
   * 
   * @param {*} sdp 
   */
  function onIncomingSDP(sdp) { 
    // console.log("Incoming SDP: " + JSON.stringify(sdp));
    mWebrtcPeerConnection.setRemoteDescription(sdp).catch(mReportError);
    mWebrtcPeerConnection.createAnswer().then(onLocalDescription).catch(mReportError);
  } 

  /**
   * Websocket から ICE の設定が渡されてきた場合に呼び出される。
   * 
   * 送られてきた接続先の ICE の設定を WebRTC に設定する。
   * 
   * @param {*} ice 
   */
  function onIncomingICE(ice) { 
    // console.log("Incoming ICE: " + JSON.stringify(ice));
    let candidate = new RTCIceCandidate(ice);
    mWebrtcPeerConnection.addIceCandidate(candidate).catch(mReportError);
  } 

  /**
   * WebRTC から ICE の設定が渡される場合に呼び出される。
   * 
   * ICE の設定を Websocket を経由して相手に送信する。
   * 
   * @param {*} event 
   * @returns 
   */
  function onIceCandidate(event) { 
    if (event.candidate == null) {
      return;
    }
    // console.log("Sending ICE candidate out: " + JSON.stringify(event.candidate));
    mWebsocketConnection.send(JSON.stringify({
      'type': 'ice', 
      'data': event.candidate
    }));
  }

  /**
   * Websocket からメッセージが届いた時に呼び出される。
   * 
   * @param {*} event 
   * @returns 
   */
  function onWebsocketMessage(event) { 
    let text = event.data
    if (text === 'HELLO') {
    } else if (text === 'BYE') {
    } else {
      let msg;
      try { 
        msg = JSON.parse(text);
      } catch (e) { 
      	console.log(text);
        return;
      }
  
      switch (msg.type) { 
        case 'sdp':
          onIncomingSDP(msg.data);
          break;
        case 'ice':
          onIncomingICE(msg.data);
          break;
        default:
          console.log('unknown type. type=' + msg.type);
          break;
      } 
    }
  }

  /**
   * WebRTC の状態が変更された時の呼び出される。
   * 
   * @param {*} event 
   */
  function onConnectionStateChange(event) {
    console.log('mWebrtcPeerConnection: ' + mWebrtcPeerConnection.connectionState)
    switch(mWebrtcPeerConnection.connectionState) {
      case 'connected':
        // The connection has become fully connected
       	console.log('connected');	
        break;
      case 'disconnected':
      console.log('disconnected');
      case 'failed':
        // One or more transports has terminated unexpectedly or in an error
        console.log('failed');
        break;
      case 'closed':
      	console.log('closed');
        // The connection has been closed
        break;
    }
  }

  /**
   * 接続先から映像のストリームの追加要求があった場合に呼び出される。
   * @param {*} event 
   */
  function onAddRemoteStream(event) { 
    console.log('streams: ', event.streams.length, event);
    if (event.transceiver.mid === "video0")
      mHtml5VideoElement1.srcObject = event.streams[0];
    if (event.transceiver.mid === "video1")
      mHtml5VideoElement2.srcObject = event.streams[0];
    if (event.transceiver.mid === "video2")
      mHtml5VideoElement3.srcObject = event.streams[0];
    if (event.transceiver.mid === "video3")
      mHtml5VideoElement4.srcObject = event.streams[0];
  } 

  /**
   * 接続先からデータチャンネルの追加要求があった場合に呼び出される。
   * 
   * @param {*} event 
   */
  function onDataChannel(event) {
    let receiveChannel = event.channel;
    receiveChannel.onopen = function (event) {
      console.log('datachannel::onopen', event);
    }

    receiveChannel.onmessage = function (event) {
      console.log('datachannel::onmessage:', event.data);

      if (mRecvDataChannelCallback) {
        mRecvDataChannelCallback(event.data);
      }
    }

    receiveChannel.onerror = function (event) {
      console.log('datachannel::onerror', event);
    }

    receiveChannel.onclose = function (event) {
      console.log('datachannel::onclose', event);
    }
  }

  /**
   * RTCPeerConnection の作成を行う。
   */
  function createWebRTC() {
    if (mWebrtcPeerConnection) {
      destroyWebRTC();
    }

    mWebrtcPeerConnection = new RTCPeerConnection(mWebrtcConfiguration);
    mWebrtcPeerConnection.onconnectionstatechange = onConnectionStateChange;
    mWebrtcPeerConnection.ontrack = onAddRemoteStream;
    mWebrtcPeerConnection.onicecandidate = onIceCandidate;
    mWebrtcPeerConnection.ondatachannel = onDataChannel;
    
    mSendDataChannel = mWebrtcPeerConnection.createDataChannel('channel', null);
    mSendDataChannel.onmessage = function (event) {
      console.log('onmessage', event.data);
    };

    mSendDataChannel.onopen = function (event) {
      console.log('onopen', event);
    };

    mSendDataChannel.onclose = function () {
      console.log('onclose');
    };
  }

  /**
   * RTCPeerConnection の後始末を行う。
   */
  function destroyWebRTC() {
    if (mWebrtcPeerConnection) {
      if (mSendDataChannel) {
        mSendDataChannel.close()
        mSendDataChannel = null;
      }

      mWebrtcPeerConnection.close();
      mWebrtcPeerConnection = null;
    }
  }

  /**
   * シグナリングサーバとの接続を行う Websocket を作成する。
   * 
   * @param {*} wsUrl 
   */
  function createWebsocket(wsUrl) {
    mWebsocketConnection = new WebSocket(wsUrl);
    mWebsocketConnection.addEventListener('open', function (event) {});
    mWebsocketConnection.addEventListener('close', function (event) {
      stopStream();
    });
    mWebsocketConnection.addEventListener('message', onWebsocketMessage);
  }

  /**
   * Websocket の後始末を行う。
   */
  function destroyWebsocket() {
    if (mWebsocketConnection) {
      mWebsocketConnection.close();
      mWebsocketConnection = null;
    }
  }

  function createWebsocketUrl(hostname, port, path) {
    var l = window.location;
    var wsScheme = (l.protocol.indexOf('https') == 0) ? 'wss' : 'ws';
    var wsHost = (hostname != undefined) ? hostname : l.hostname;
    var wsPort = (port != undefined) ? port : l.port;
    var wsPath = (path != undefined) ? path : '';
    if (wsPort) {
      wsPort = ':' + wsPort;
    }
    return wsScheme + '://' + wsHost + wsPort + '/' + wsPath;
  }

  /**
   * WebRTC の接続を開始する。
   * 
   * @param {*} videoElement 映像を表示する video タグのエレメント
   * @param {*} hostname ホスト名 省略された場合は HTML が置いてあるサーバのホスト名
   * @param {*} port ポート番号
   * @param {*} path パス
   * @param {*} configuration WebRTC の設定
   * @param {*} dataChannelCB データチャンネルのメッセージを通知するコールバック
   * @param {*} reportErrorCB エラーを通知するコールバック
   */
  function playStream(videoElement1,videoElement2,videoElement3,videoElement4, hostname, port, path, configuration, dataChannelCB, reportErrorCB) { 
    mHtml5VideoElement1 = videoElement1;
    mHtml5VideoElement2 = videoElement2;
    mHtml5VideoElement3 = videoElement3;
    mHtml5VideoElement4 = videoElement4;
    mWebrtcConfiguration = configuration;
    mRecvDataChannelCallback = dataChannelCB;
    mReportError = (reportErrorCB != undefined) ? reportErrorCB : function(text) {};
    createWebRTC();
    //port = 5050;
    //hostname = "127.0.0.1"
    //path = ""
    createWebsocket(createWebsocketUrl(hostname, port, path));
  } 
  parent.playStream = playStream;

  /**
   * WebRTC を停止する。
   */
  function stopStream() {
    destroyWebRTC();
    destroyWebsocket();
  }
  parent.stopStream = stopStream;

  /**
   * データチャンネルでメッセージを送信する。
   * @param {*}} message 
   */
  function sendDataChannel(message) {
    if (mSendDataChannel && message) {
      mSendDataChannel.send(message);
    }
  }
  parent.sendDataChannel = sendDataChannel;

  return parent;
})(webrtc || {}, this.self || global);
