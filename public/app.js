// node_modules/@cloudflare/speedtest/dist/speedtest.js
var REL_API_URL = "https://speed.cloudflare.com";
var defaultConfig = {
  autoStart: true,
  downloadApiUrl: `${REL_API_URL}/__down`,
  uploadApiUrl: `${REL_API_URL}/__up`,
  logMeasurementApiUrl: null,
  logAimApiUrl: "https://aim.cloudflare.com/__log",
  turnServerUri: "turn.speed.cloudflare.com:50000",
  turnServerCredsApiUrl: `${REL_API_URL}/turn-creds`,
  turnServerUser: null,
  turnServerPass: null,
  rpkiInvalidHost: "invalid.rpki.cloudflare.com",
  includeCredentials: false,
  sessionId: void 0,
  measurements: [
    {
      type: "latency",
      numPackets: 1
    },
    {
      type: "download",
      bytes: 1e5,
      count: 1,
      bypassMinDuration: true
    },
    {
      type: "latency",
      numPackets: 20
    },
    {
      type: "download",
      bytes: 1e5,
      count: 9
    },
    {
      type: "download",
      bytes: 1e6,
      count: 8
    },
    {
      type: "upload",
      bytes: 1e5,
      count: 8
    },
    {
      type: "packetLoss",
      numPackets: 1e3,
      batchSize: 10,
      batchWaitTime: 10,
      responsesWaitTime: 3e3
    },
    {
      type: "upload",
      bytes: 1e6,
      count: 6
    },
    {
      type: "download",
      bytes: 1e7,
      count: 6
    },
    {
      type: "upload",
      bytes: 1e7,
      count: 4
    },
    {
      type: "download",
      bytes: 25e6,
      count: 4
    },
    {
      type: "upload",
      bytes: 25e6,
      count: 4
    },
    {
      type: "download",
      bytes: 1e8,
      count: 3
    },
    {
      type: "upload",
      bytes: 5e7,
      count: 3
    },
    {
      type: "download",
      bytes: 25e7,
      count: 2
    }
  ],
  measureDownloadLoadedLatency: true,
  measureUploadLoadedLatency: true,
  loadedLatencyThrottle: 400,
  bandwidthFinishRequestDuration: 1e3,
  estimatedServerTime: 10,
  bandwidthAbortRequestDuration: 0,
  latencyPercentile: 0.5,
  bandwidthPercentile: 0.9,
  bandwidthMinRequestDuration: 10,
  loadedRequestMinDuration: 250,
  loadedLatencyMaxPoints: 20
};
var scaleThreshold = (domain, range) => {
  return (value) => {
    let i = 0;
    while (i < domain.length && value >= domain[i]) i++;
    return range[i];
  };
};
var internalConfig = {
  aimMeasurementScoring: {
    packetLoss: scaleThreshold([
      0.01,
      0.05,
      0.25,
      0.5
    ], [
      10,
      5,
      0,
      -10,
      -20
    ]),
    latency: scaleThreshold([
      10,
      20,
      50,
      100,
      500
    ], [
      20,
      10,
      5,
      0,
      -10,
      -20
    ]),
    loadedLatencyIncrease: scaleThreshold([
      10,
      20,
      50,
      100,
      500
    ], [
      20,
      10,
      5,
      0,
      -10,
      -20
    ]),
    jitter: scaleThreshold([
      10,
      20,
      100,
      500
    ], [
      10,
      5,
      0,
      -10,
      -20
    ]),
    download: scaleThreshold([
      1e6,
      1e7,
      5e7,
      1e8
    ], [
      0,
      5,
      10,
      20,
      30
    ]),
    upload: scaleThreshold([
      1e6,
      1e7,
      5e7,
      1e8
    ], [
      0,
      5,
      10,
      20,
      30
    ])
  },
  aimExperiencesDefs: {
    streaming: {
      input: [
        "latency",
        "packetLoss",
        "download",
        "loadedLatencyIncrease"
      ],
      pointThresholds: [
        15,
        20,
        40,
        60
      ]
    },
    gaming: {
      input: [
        "latency",
        "packetLoss",
        "loadedLatencyIncrease"
      ],
      pointThresholds: [
        5,
        15,
        25,
        30
      ]
    },
    rtc: {
      input: [
        "latency",
        "jitter",
        "packetLoss",
        "loadedLatencyIncrease"
      ],
      pointThresholds: [
        5,
        15,
        25,
        40
      ]
    }
  }
};
var MAX_RETRIES = 20;
var cfGetServerTime = (r) => {
  const serverTiming = r.headers.get(`server-timing`);
  if (serverTiming) {
    const re = serverTiming.match(/(?:^|;)\s*dur=([0-9.]+)/);
    if (re) return +re[1];
  }
};
var getTtfb = (perf) => perf.responseStart - perf.requestStart;
var getPayloadDownload = (perf) => perf.responseEnd - perf.responseStart;
var calcDownloadDuration = ({ ping, payloadDownloadTime }) => ping + payloadDownloadTime;
var calcUploadDuration = ({ ttfb }) => ttfb;
var calcDownloadSpeed = ({ duration, transferSize }, numBytes) => {
  const bits = 8 * (transferSize || +numBytes * 1.005);
  const secs = duration / 1e3;
  return !secs ? void 0 : bits / secs;
};
var calcUploadSpeed = ({ duration }, numBytes) => {
  const bits = 8 * numBytes * 1.005;
  const secs = duration / 1e3;
  return !secs ? void 0 : bits / secs;
};
var genContent = /* @__PURE__ */ (() => {
  const cache = /* @__PURE__ */ new Map();
  return (numBytes) => {
    if (!cache.has(numBytes)) cache.set(numBytes, "0".repeat(numBytes));
    return cache.get(numBytes);
  };
})();
var BandwidthMeasurementEngine = class {
  constructor(measurements, { downloadApiUrl, uploadApiUrl, throttleMs = 0, estimatedServerTime = 0 } = {}) {
    if (!measurements) throw new Error("Missing measurements argument");
    if (!downloadApiUrl) throw new Error("Missing downloadApiUrl argument");
    if (!uploadApiUrl) throw new Error("Missing uploadApiUrl argument");
    this.#measurements = measurements;
    this.#downloadApi = downloadApiUrl;
    this.#uploadApi = uploadApiUrl;
    this.#throttleMs = throttleMs;
    this.#estimatedServerTime = Math.max(0, estimatedServerTime);
  }
  get results() {
    return this.#results;
  }
  #qsParams = {};
  get qsParams() {
    return this.#qsParams;
  }
  set qsParams(v) {
    this.#qsParams = v;
  }
  #fetchOptions = {};
  get fetchOptions() {
    return this.#fetchOptions;
  }
  set fetchOptions(v) {
    this.#fetchOptions = v;
  }
  finishRequestDuration = 1e3;
  abortRequestDuration = 0;
  getServerTime = cfGetServerTime;
  #responseHook = () => {
  };
  set responseHook(f) {
    this.#responseHook = f;
  }
  #onRunningChange = () => {
  };
  set onRunningChange(f) {
    this.#onRunningChange = f;
  }
  #onNewMeasurementStarted = () => {
  };
  set onNewMeasurementStarted(f) {
    this.#onNewMeasurementStarted = f;
  }
  #onMeasurementResult = () => {
  };
  set onMeasurementResult(f) {
    this.#onMeasurementResult = f;
  }
  #onFinished = () => {
  };
  set onFinished(f) {
    this.#onFinished = f;
  }
  #onConnectionError = () => {
  };
  set onConnectionError(f) {
    this.#onConnectionError = f;
  }
  pause() {
    this.#cancelCurrentMeasurement(`pause()`);
    this.#setRunning(false);
  }
  play() {
    if (!this.#running) {
      this.#setRunning(true);
      this.#nextMeasurement();
    }
  }
  #measurements;
  #downloadApi;
  #uploadApi;
  #running = false;
  #finished = {
    down: false,
    up: false
  };
  #results = {
    down: {},
    up: {}
  };
  #measIdx = 0;
  #counter = 0;
  #retries = 0;
  #minDuration = -Infinity;
  #throttleMs = 0;
  #estimatedServerTime = 0;
  #currentAbortController = void 0;
  #setRunning(running) {
    if (running !== this.#running) {
      this.#running = running;
      setTimeout(() => this.#onRunningChange(this.#running));
    }
    if (!running) this.#currentAbortController?.abort("setRunning(false)");
  }
  #saveMeasurementResults(measIdx, measTiming) {
    const { bytes, dir } = this.#measurements[measIdx];
    const results = this.#results;
    const bytesResult = results[dir].hasOwnProperty(bytes) ? results[dir][bytes] : {
      timings: [],
      numMeasurements: this.#measurements.filter(({ bytes: b, dir: d }) => bytes === b && dir === d).map((m) => m.count).reduce((agg, cnt) => agg + cnt, 0)
    };
    measTiming && bytesResult.timings.push(measTiming);
    bytesResult.timings = bytesResult.timings.slice(-bytesResult.numMeasurements);
    results[dir][bytes] = bytesResult;
    if (measTiming) setTimeout(() => {
      this.#onMeasurementResult({
        type: dir,
        bytes,
        ...measTiming
      }, results);
    });
    else this.#onNewMeasurementStarted(this.#measurements[measIdx], results);
  }
  #nextMeasurement() {
    const measurements = this.#measurements;
    let meas = measurements[this.#measIdx];
    if (this.#counter >= meas.count) {
      const finished = this.#finished;
      if (this.#minDuration > this.finishRequestDuration && !meas.bypassMinDuration) {
        const dir2 = meas.dir;
        this.#finished[dir2] = true;
        Object.values(this.#finished).every((finished2) => finished2) && this.#onFinished(this.#results);
      }
      this.#counter = 0;
      this.#minDuration = -Infinity;
      performance.clearResourceTimings();
      do
        this.#measIdx += 1;
      while (this.#measIdx < measurements.length && finished[measurements[this.#measIdx].dir]);
      if (this.#measIdx >= measurements.length) {
        this.#finished = {
          down: true,
          up: true
        };
        this.#setRunning(false);
        this.#onFinished(this.#results);
        return;
      }
      meas = measurements[this.#measIdx];
    }
    const measIdx = this.#measIdx;
    if (this.#counter === 0) this.#saveMeasurementResults(measIdx);
    const { bytes: numBytes, dir } = meas;
    const isDown = dir === "down";
    const apiUrl = isDown ? this.#downloadApi : this.#uploadApi;
    const qsParams = Object.assign({}, this.#qsParams);
    isDown && (qsParams.bytes = `${numBytes}`);
    const urlObj = new URL(apiUrl, window.location.origin);
    Object.entries(qsParams).forEach(([k, v]) => urlObj.searchParams.set(k, v));
    const url = urlObj.href;
    const fetchOpt = Object.assign({}, isDown ? {} : {
      method: "POST",
      body: genContent(numBytes)
    }, this.#fetchOptions);
    if (this.#retries === 0) {
      this.#currentAbortController?.abort("restarting engine");
      this.#currentAbortController = new AbortController();
      if (this.abortRequestDuration) {
        const abortTimeout = setTimeout(() => {
          const errorMessage = `${isDown ? "Download" : "Upload"} measurement of ${numBytes} bytes aborted. Measurement exceeded bandwidthAbortRequestDuration (${this.abortRequestDuration}ms)`;
          this.#cancelCurrentMeasurement(errorMessage);
          this.#retries = 0;
          this.#setRunning(false);
          this.#onConnectionError(errorMessage);
        }, this.abortRequestDuration);
        this.#currentAbortController.signal.addEventListener("abort", () => clearTimeout(abortTimeout));
      }
    }
    let serverTime;
    fetch(url, {
      ...fetchOpt,
      signal: this.#currentAbortController.signal
    }).then((r) => {
      if (r.ok) return r;
      throw Error(r.statusText);
    }).then((r) => {
      this.getServerTime && (serverTime = this.getServerTime(r));
      return r;
    }).then((r) => r.text().then((body) => {
      this.#responseHook({
        url,
        headers: r.headers,
        body
      });
      return body;
    })).then(() => {
      const perf = performance.getEntriesByName(url).slice(-1)[0];
      const timing = {
        transferSize: perf.transferSize,
        ttfb: getTtfb(perf),
        payloadDownloadTime: getPayloadDownload(perf),
        serverTime: serverTime || -1,
        measTime: /* @__PURE__ */ new Date(),
        ping: 0,
        duration: 0,
        bps: void 0
      };
      timing.ping = Math.max(0.01, timing.ttfb - (serverTime || this.#estimatedServerTime));
      timing.duration = (isDown ? calcDownloadDuration : calcUploadDuration)(timing);
      timing.bps = (isDown ? calcDownloadSpeed : calcUploadSpeed)(timing, numBytes);
      if (isDown && numBytes) {
        const reqSize = +numBytes;
        if (timing.transferSize && (timing.transferSize < reqSize || timing.transferSize / reqSize > 1.05)) console.warn(`Requested ${reqSize}B but received ${timing.transferSize}B (${Math.round(timing.transferSize / reqSize * 1e4) / 100}%).`);
      }
      this.#saveMeasurementResults(measIdx, timing);
      const requestDuration = timing.duration;
      this.#minDuration = this.#minDuration < 0 ? requestDuration : Math.min(this.#minDuration, requestDuration);
      this.#counter += 1;
      this.#retries = 0;
      if (this.#throttleMs) {
        const throttleTimeout = setTimeout(() => this.#nextMeasurement(), this.#throttleMs);
        this.#currentAbortController.signal.addEventListener("abort", () => clearTimeout(throttleTimeout));
      } else this.#nextMeasurement();
    }).catch((error) => {
      if (this.#currentAbortController.signal.aborted) return;
      console.warn(`Error fetching ${url}: ${error}`);
      if (this.#retries++ < MAX_RETRIES) this.#nextMeasurement();
      else {
        this.#retries = 0;
        this.#setRunning(false);
        this.#onConnectionError(`Connection failed to ${url}. Gave up after ${MAX_RETRIES} retries.`);
      }
    });
  }
  #cancelCurrentMeasurement(reason) {
    this.#currentAbortController?.abort(reason || `aborted with no reason provided`);
  }
};
var BandwidthWithParallelLatencyEngine = class extends BandwidthMeasurementEngine {
  constructor(measurements, { measureParallelLatency = false, parallelLatencyThrottleMs = 100, downloadApiUrl, uploadApiUrl, estimatedServerTime = 0, ...ptProps } = {}) {
    super(measurements, {
      downloadApiUrl,
      uploadApiUrl,
      estimatedServerTime,
      ...ptProps
    });
    if (measureParallelLatency) {
      this.#latencyEngine = new BandwidthMeasurementEngine([{
        dir: "down",
        bytes: 0,
        count: Infinity,
        bypassMinDuration: true
      }], {
        downloadApiUrl,
        uploadApiUrl,
        estimatedServerTime,
        throttleMs: parallelLatencyThrottleMs
      });
      this.#latencyEngine.qsParams = { during: `${measurements[0].dir}load` };
      super.onRunningChange = this.#setLatencyRunning;
      super.onConnectionError = () => this.#latencyEngine.pause();
    }
  }
  get latencyResults() {
    return this.#latencyEngine && this.#latencyEngine.results.down[0].timings;
  }
  set onParallelLatencyResult(f) {
    this.#latencyEngine && (this.#latencyEngine.onMeasurementResult = (res) => f(res));
  }
  get fetchOptions() {
    return super.fetchOptions;
  }
  set fetchOptions(fetchOptions) {
    super.fetchOptions = fetchOptions;
    this.#latencyEngine && (this.#latencyEngine.fetchOptions = fetchOptions);
  }
  set onRunningChange(onRunningChange) {
    super.onRunningChange = (running) => {
      this.#setLatencyRunning(running);
      onRunningChange(running);
    };
  }
  set onConnectionError(onConnectionError) {
    super.onConnectionError = (...args) => {
      this.#latencyEngine && this.#latencyEngine.pause();
      onConnectionError(...args);
    };
  }
  #latencyEngine;
  #latencyTimeout;
  #setLatencyRunning = (running) => {
    if (this.#latencyEngine) if (!running) {
      clearTimeout(this.#latencyTimeout);
      this.#latencyEngine.pause();
    } else this.#latencyTimeout = setTimeout(() => this.#latencyEngine.play(), 20);
  };
};
var LoggingBandwidthEngine = class extends BandwidthWithParallelLatencyEngine {
  constructor(measurements, { measurementId, logApiUrl, sessionId, ...ptProps } = {}) {
    super(measurements, ptProps);
    this.#measurementId = measurementId;
    this.#logApiUrl = logApiUrl;
    this.#sessionId = sessionId;
    super.qsParams = logApiUrl ? { measId: this.#measurementId } : {};
    super.responseHook = (r) => this.#loggingResponseHook(r);
    super.onMeasurementResult = (meas) => this.#logMeasurement(meas);
  }
  set qsParams(qsParams) {
    super.qsParams = this.#logApiUrl ? {
      measId: this.#measurementId,
      ...qsParams
    } : qsParams;
  }
  set responseHook(responseHook) {
    super.responseHook = (r) => {
      responseHook(r);
      this.#loggingResponseHook(r);
    };
  }
  set onMeasurementResult(onMeasurementResult) {
    super.onMeasurementResult = (meas, ...restArgs) => {
      onMeasurementResult(meas, ...restArgs);
      this.#logMeasurement(meas);
    };
  }
  #measurementId;
  #token;
  #requestTime;
  #logApiUrl;
  #sessionId;
  #loggingResponseHook(r) {
    if (!this.#logApiUrl) return;
    this.#requestTime = +r.headers.get(`cf-meta-request-time`);
    this.#token = r.body.slice(-300).split("___").pop();
  }
  #logMeasurement(measData) {
    if (!this.#logApiUrl) return;
    const logData = {
      type: measData.type,
      bytes: measData.bytes,
      ping: Math.round(measData.ping),
      ttfb: Math.round(measData.ttfb),
      payloadDownloadTime: Math.round(measData.payloadDownloadTime),
      duration: Math.round(measData.duration),
      transferSize: Math.round(measData.transferSize),
      serverTime: Math.round(measData.serverTime),
      token: this.#token,
      requestTime: this.#requestTime,
      measId: this.#measurementId,
      sessionId: this.#sessionId
    };
    this.#token = null;
    this.#requestTime = null;
    fetch(this.#logApiUrl, {
      method: "POST",
      body: JSON.stringify(logData),
      ...this.fetchOptions
    });
  }
};
var PromiseEngine = class {
  constructor(promiseFn) {
    if (!promiseFn) throw new Error(`Missing operation to perform`);
    this.#promiseFn = promiseFn;
    this.play();
  }
  pause() {
    this.#cancelCurrent();
    this.#setRunning(false);
  }
  stop() {
    this.pause();
  }
  play() {
    if (!this.#running) {
      this.#setRunning(true);
      this.#next();
    }
  }
  #running = false;
  #currentPromise = void 0;
  #promiseFn;
  #setRunning(running) {
    if (running !== this.#running) this.#running = running;
  }
  #next() {
    const curPromise = this.#currentPromise = this.#promiseFn().then(() => {
      !curPromise._cancel && this.#next();
    });
  }
  #cancelCurrent() {
    const curPromise = this.#currentPromise;
    curPromise && (curPromise._cancel = true);
  }
};
var LoadNetworkEngine = class {
  constructor({ download, upload } = {}) {
    if (!download && !upload) throw new Error("Missing at least one of download/upload config");
    [[download, "download"], [upload, "upload"]].filter((entry) => entry[0] !== null && entry[0] !== void 0).forEach(([cfg, type]) => {
      const { apiUrl, chunkSize } = cfg;
      if (!apiUrl) throw new Error(`Missing ${type} apiUrl argument`);
      if (!chunkSize) throw new Error(`Missing ${type} chunkSize argument`);
    });
    const getLoadEngine = ({ apiUrl, qsParams = {}, fetchOptions = {} }) => new PromiseEngine(() => {
      const fetchQsParams = Object.assign({}, qsParams, this.qsParams);
      const urlObj = new URL(apiUrl, window.location.origin);
      Object.entries(fetchQsParams).forEach(([k, v]) => urlObj.searchParams.set(k, v));
      const url = urlObj.href;
      const fetchOpt = Object.assign({}, fetchOptions, this.fetchOptions);
      return fetch(url, fetchOpt).then((r) => {
        if (r.ok) return r;
        throw Error(r.statusText);
      }).then((r) => r.text());
    });
    download && this.#engines.push(getLoadEngine({
      apiUrl: download.apiUrl,
      qsParams: { bytes: `${download.chunkSize}` }
    }));
    upload && this.#engines.push(getLoadEngine({
      apiUrl: upload.apiUrl,
      fetchOptions: {
        method: "POST",
        body: "0".repeat(upload.chunkSize)
      }
    }));
  }
  qsParams = {};
  fetchOptions = {};
  pause() {
    this.#engines.forEach((engine) => engine.pause());
  }
  stop() {
    this.pause();
  }
  play() {
    this.#engines.forEach((engine) => engine.play());
  }
  #engines = [];
};
var SelfWebRtcDataConnection = class {
  constructor({ iceServers = [], acceptIceCandidate = (candidate) => {
    let protocol = candidate.protocol || "";
    if (!protocol && candidate.candidate) {
      const sdpAttrs = candidate.candidate.split(" ");
      sdpAttrs.length >= 3 && (protocol = sdpAttrs[2]);
    }
    return protocol.toLowerCase() === "udp";
  }, dataChannelCfg = {
    ordered: false,
    maxRetransmits: 0
  }, ...rtcPeerConnectionCfg } = {}) {
    const sender = new RTCPeerConnection({
      iceServers,
      ...rtcPeerConnectionCfg
    });
    const receiver = new RTCPeerConnection({
      iceServers,
      ...rtcPeerConnectionCfg
    });
    const senderDc = sender.createDataChannel("channel", dataChannelCfg);
    senderDc.onopen = () => {
      this.#established = true;
      this.onOpen();
    };
    senderDc.onclose = () => this.close();
    receiver.ondatachannel = (e) => {
      const dc = e.channel;
      dc.onclose = () => this.close();
      dc.onmessage = (msg) => this.onMessageReceived(msg.data);
      this.#receiverDc = dc;
    };
    sender.onicecandidate = (e) => {
      e.candidate && acceptIceCandidate(e.candidate) && receiver.addIceCandidate(e.candidate);
    };
    receiver.onicecandidate = (e) => {
      e.candidate && acceptIceCandidate(e.candidate) && sender.addIceCandidate(e.candidate);
    };
    sender.createOffer().then((offer) => sender.setLocalDescription(offer)).then(() => receiver.setRemoteDescription(sender.localDescription)).then(() => receiver.createAnswer()).then((answer) => receiver.setLocalDescription(answer)).then(() => sender.setRemoteDescription(receiver.localDescription));
    this.#sender = sender;
    this.#receiver = receiver;
    this.#senderDc = senderDc;
  }
  onOpen = () => {
  };
  onClose = () => {
  };
  onMessageReceived = () => {
  };
  send(msg) {
    this.#senderDc.send(String(msg));
  }
  close() {
    this.#sender && this.#sender.close();
    this.#receiver && this.#receiver.close();
    this.#senderDc && this.#senderDc.close();
    this.#receiverDc && this.#receiverDc.close();
    this.#established && this.onClose();
    this.#established = false;
    return this;
  }
  #established = false;
  #sender;
  #receiver;
  #senderDc;
  #receiverDc;
};
var PacketLossEngine = class {
  constructor({ turnServerUri, turnServerCredsApi, turnServerCredsApiParser = ({ username, credential, server }) => ({
    turnServerUser: username,
    turnServerPass: credential,
    turnServerUri: server
  }), turnServerCredsApiIncludeCredentials = false, turnServerUser, turnServerPass, numMsgs = 100, batchSize = 10, batchWaitTime = 10, responsesWaitTime = 5e3, connectionTimeout = 5e3 } = {}) {
    if (!turnServerUri && !turnServerCredsApi) throw new Error("Missing turnServerCredsApi or turnServerUri argument");
    if ((!turnServerUser || !turnServerPass) && !turnServerCredsApi) throw new Error("Missing either turnServerCredsApi or turnServerUser+turnServerPass arguments");
    this.#numMsgs = numMsgs;
    (!turnServerUser || !turnServerPass ? fetch(turnServerCredsApi, { credentials: turnServerCredsApiIncludeCredentials ? "include" : void 0 }).then((r) => r.json()).then((d) => {
      if (d.error) throw d.error;
      return d;
    }).then(turnServerCredsApiParser) : Promise.resolve({
      turnServerUser,
      turnServerPass
    })).catch((e) => this.#onCredentialsFailure(e)).then((creds) => {
      if (!creds) return;
      const { turnServerUser: credsUser, turnServerPass: credsPass, turnServerUri: credsApiTurnServerUri } = creds;
      const c = new SelfWebRtcDataConnection({
        iceServers: [{
          urls: `turn:${credsApiTurnServerUri || turnServerUri}?transport=udp`,
          username: credsUser,
          credential: credsPass
        }],
        iceTransportPolicy: "relay"
      });
      let connectionSuccess = false;
      setTimeout(() => {
        if (!connectionSuccess) {
          c.close();
          this.#onConnectionError("ICE connection timeout!");
        }
      }, connectionTimeout);
      const msgTracker = this.#msgTracker;
      c.onOpen = () => {
        connectionSuccess = true;
        const self = this;
        (function sendNum(n) {
          if (n <= numMsgs) {
            let i = n;
            while (i <= Math.min(numMsgs, n + batchSize - 1)) {
              msgTracker[i] = false;
              c.send(i);
              self.onMsgSent(i);
              i++;
            }
            setTimeout(() => sendNum(i), batchWaitTime);
          } else {
            self.onAllMsgsSent(Object.keys(msgTracker).length);
            const finishFn = () => {
              c.close();
              self.#onFinished(self.results);
            };
            let finishTimeout = setTimeout(finishFn, responsesWaitTime);
            let missingMsgs = Object.values(self.#msgTracker).filter((recv) => !recv).length;
            c.onMessageReceived = (msg) => {
              clearTimeout(finishTimeout);
              msgTracker[msg] = true;
              self.onMsgReceived(msg);
              missingMsgs--;
              if (missingMsgs <= 0 && Object.values(self.#msgTracker).every((recv) => recv)) finishFn();
              else finishTimeout = setTimeout(finishFn, responsesWaitTime);
            };
          }
        })(1);
      };
      c.onMessageReceived = (msg) => {
        msgTracker[msg] = true;
        this.onMsgReceived(msg);
      };
    }).catch((e) => this.#onConnectionError(e.toString()));
  }
  #onCredentialsFailure = () => {
  };
  set onCredentialsFailure(f) {
    this.#onCredentialsFailure = f;
  }
  #onConnectionError = () => {
  };
  set onConnectionError(f) {
    this.#onConnectionError = f;
  }
  #onFinished = () => {
  };
  set onFinished(f) {
    this.#onFinished = f;
  }
  onMsgSent = () => {
  };
  onAllMsgsSent = () => {
  };
  onMsgReceived = () => {
  };
  get results() {
    const totalMessages = this.#numMsgs;
    const numMessagesSent = Object.keys(this.#msgTracker).length;
    const lostMessages = Object.entries(this.#msgTracker).filter(([, recv]) => !recv).map(([n]) => +n);
    return {
      totalMessages,
      numMessagesSent,
      packetLoss: lostMessages.length / numMessagesSent,
      lostMessages
    };
  }
  #msgTracker = {};
  #numMsgs;
};
var PacketLossUnderLoadEngine = class extends PacketLossEngine {
  constructor({ downloadChunkSize, uploadChunkSize, downloadApiUrl, uploadApiUrl, ...ptProps } = {}) {
    super(ptProps);
    if (downloadChunkSize || uploadChunkSize) {
      this.#loadEngine = new LoadNetworkEngine({
        download: downloadChunkSize ? {
          apiUrl: downloadApiUrl,
          chunkSize: downloadChunkSize
        } : null,
        upload: uploadChunkSize ? {
          apiUrl: uploadApiUrl,
          chunkSize: uploadChunkSize
        } : null
      });
      super.onCredentialsFailure = super.onConnectionError = super.onFinished = () => this.#loadEngine.stop();
    }
  }
  set qsParams(qsParams) {
    this.#loadEngine && (this.#loadEngine.qsParams = qsParams);
  }
  set fetchOptions(fetchOptions) {
    this.#loadEngine && (this.#loadEngine.fetchOptions = fetchOptions);
  }
  set onCredentialsFailure(onCredentialsFailure) {
    super.onCredentialsFailure = (...args) => {
      onCredentialsFailure(...args);
      this.#loadEngine && this.#loadEngine.stop();
    };
  }
  set onConnectionError(onConnectionError) {
    super.onConnectionError = (...args) => {
      onConnectionError(...args);
      this.#loadEngine && this.#loadEngine.stop();
    };
  }
  set onFinished(onFinished) {
    super.onFinished = (...args) => {
      onFinished(...args);
      this.#loadEngine && this.#loadEngine.stop();
    };
  }
  #loadEngine;
};
var ReachabilityEngine = class {
  constructor(targetUrl, { timeout = -1, fetchOptions = {} } = {}) {
    let finished = false;
    const finish = ({ reachable, ...rest }) => {
      if (finished) return;
      finished = true;
      this.onFinished({
        targetUrl,
        reachable,
        ...rest
      });
    };
    fetch(targetUrl, fetchOptions).then((response) => {
      finish({
        reachable: true,
        response
      });
    }).catch((error) => {
      finish({
        reachable: false,
        error
      });
    });
    timeout > 0 && setTimeout(() => finish({
      reachable: false,
      error: "Request timeout"
    }), timeout);
  }
  onFinished = () => {
  };
};
var sum = (vals) => vals.reduce((agg, val) => agg + val, 0);
var percentile = (vals, perc = 0.5) => {
  if (!vals.length) return 0;
  const sortedVals = vals.slice().sort((a, b) => a - b);
  const idx = (vals.length - 1) * perc;
  const rem = idx % 1;
  if (rem === 0) return sortedVals[Math.round(idx)];
  const edges = [Math.floor, Math.ceil].map((rndFn) => sortedVals[rndFn(idx)]);
  return edges[0] + (edges[1] - edges[0]) * rem;
};
var MeasurementCalculations = class {
  constructor(config) {
    this.#config = config;
  }
  getLatencyPoints = (latencyResults) => latencyResults.timings.map((d) => d.ping);
  getLatency = (latencyResults) => percentile(this.getLatencyPoints(latencyResults), this.#config.latencyPercentile);
  getJitter(latencyResults) {
    const pings = this.getLatencyPoints(latencyResults);
    return pings.length < 2 ? null : pings.reduce(({ sumDeltas = 0, prevLatency }, latency) => ({
      sumDeltas: sumDeltas + (prevLatency !== void 0 ? Math.abs(prevLatency - latency) : 0),
      prevLatency: latency
    }), {}).sumDeltas / (pings.length - 1);
  }
  getBandwidthPoints = (bandwidthResults) => Object.entries(bandwidthResults).map(([bytes, { timings }]) => timings.map(({ bps, duration, ping, measTime, serverTime, transferSize }) => ({
    bytes: +bytes,
    bps,
    duration,
    ping,
    measTime,
    serverTime,
    transferSize
  }))).flat();
  getBandwidth = (bandwidthResults) => percentile(this.getBandwidthPoints(bandwidthResults).filter((d) => d.duration >= this.#config.bandwidthMinRequestDuration).map((d) => d.bps).filter((bps) => bps), this.#config.bandwidthPercentile);
  getLoadedLatency = (loadedResults) => this.getLatency({ timings: this.#extractLoadedLatencies(loadedResults) });
  getLoadedJitter = (loadedResults) => this.getJitter({ timings: this.#extractLoadedLatencies(loadedResults) });
  getLoadedLatencyPoints = (loadedResults) => this.getLatencyPoints({ timings: this.#extractLoadedLatencies(loadedResults) });
  getPacketLoss = (plResults) => plResults.packetLoss;
  getPacketLossDetails = (plResults) => plResults;
  getReachability = (reachabilityResults) => !!reachabilityResults.reachable;
  getReachabilityDetails = (d) => ({
    host: d.host,
    reachable: d.reachable
  });
  #config;
  #extractLoadedLatencies = (loadedResults) => Object.values(loadedResults).filter((d) => d.timings.length && Math.min(...d.timings.map((d2) => d2.duration)) >= this.#config.loadedRequestMinDuration).map((d) => d.sideLatency || []).flat().slice(-this.#config.loadedLatencyMaxPoints);
};
var classificationNames = [
  "bad",
  "poor",
  "average",
  "good",
  "great"
];
var customResultTypes = { loadedLatencyIncrease: (measurements) => measurements.latency && (measurements.downLoadedLatency || measurements.upLoadedLatency) ? Math.max(measurements.downLoadedLatency, measurements.upLoadedLatency) - measurements.latency : void 0 };
var defaultPoints = { packetLoss: 0 };
var ScoresCalculations = class {
  constructor(config) {
    this.#config = config;
  }
  getScores(measurements) {
    const scores = Object.assign({}, ...Object.entries(this.#config.aimMeasurementScoring).map(([type, fn]) => {
      const val = customResultTypes.hasOwnProperty(type) ? customResultTypes[type](measurements) : measurements[type];
      return val === void 0 ? defaultPoints.hasOwnProperty(type) ? { [type]: defaultPoints[type] } : {} : { [type]: +fn(val) };
    }));
    return Object.assign({}, ...Object.entries(this.#config.aimExperiencesDefs).filter(([, { input }]) => input.every((k) => scores.hasOwnProperty(k))).map(([k, { input, pointThresholds }]) => {
      const sumPoints = Math.max(0, sum(input.map((k2) => scores[k2])));
      const classificationIdx = scaleThreshold(pointThresholds, [
        0,
        1,
        2,
        3,
        4
      ])(sumPoints);
      const classificationName = classificationNames[classificationIdx];
      return { [k]: {
        points: sumPoints,
        classificationIdx,
        classificationName
      } };
    }));
  }
  #config;
};
var Results = class {
  constructor(config) {
    this.#config = config;
    this.clear();
    this.#measCalc = new MeasurementCalculations(this.#config);
    this.#scoresCalc = new ScoresCalculations(this.#config);
  }
  raw;
  get isFinished() {
    return Object.values(this.raw).filter((d) => d !== null && typeof d === "object").every((d) => d.finished);
  }
  clear() {
    this.raw = Object.assign({ totalDurationMs: void 0 }, ...[...new Set(this.#config.measurements.map((m) => m.type))].map((m) => ({ [m]: {
      started: false,
      finished: false,
      results: {}
    } })));
  }
  getUnloadedLatency = () => this.#calcGetter("getLatency", "latency");
  getUnloadedJitter = () => this.#calcGetter("getJitter", "latency");
  getUnloadedLatencyPoints = () => this.#calcGetter("getLatencyPoints", "latency", []);
  getDownLoadedLatency = () => this.#calcGetter("getLoadedLatency", "download");
  getDownLoadedJitter = () => this.#calcGetter("getLoadedJitter", "download");
  getDownLoadedLatencyPoints = () => this.#calcGetter("getLoadedLatencyPoints", "download", []);
  getUpLoadedLatency = () => this.#calcGetter("getLoadedLatency", "upload");
  getUpLoadedJitter = () => this.#calcGetter("getLoadedJitter", "upload");
  getUpLoadedLatencyPoints = () => this.#calcGetter("getLoadedLatencyPoints", "upload", []);
  getDownloadBandwidth = () => this.#calcGetter("getBandwidth", "download");
  getDownloadBandwidthPoints = () => this.#calcGetter("getBandwidthPoints", "download", []);
  getUploadBandwidth = () => this.#calcGetter("getBandwidth", "upload");
  getUploadBandwidthPoints = () => this.#calcGetter("getBandwidthPoints", "upload", []);
  getPacketLoss = () => this.#calcGetter("getPacketLoss", "packetLoss");
  getPacketLossDetails = () => this.#calcGetter("getPacketLossDetails", "packetLoss", void 0, true);
  getTotalDurationMs = () => this.raw.totalDurationMs;
  getSummary() {
    const items = {
      download: this.getDownloadBandwidth,
      upload: this.getUploadBandwidth,
      latency: this.getUnloadedLatency,
      jitter: this.getUnloadedJitter,
      downLoadedLatency: this.getDownLoadedLatency,
      downLoadedJitter: this.getDownLoadedJitter,
      upLoadedLatency: this.getUpLoadedLatency,
      upLoadedJitter: this.getUpLoadedJitter,
      packetLoss: this.getPacketLoss,
      v4Reachability: this.#getV4Reachability,
      v6Reachability: this.#getV6Reachability,
      totalDurationMs: this.getTotalDurationMs
    };
    return Object.assign({}, ...Object.entries(items).map(([key, fn]) => {
      const val = fn();
      return val === void 0 ? {} : { [key]: val };
    }));
  }
  getScores = () => this.#scoresCalc.getScores(this.getSummary());
  #config;
  #measCalc;
  #scoresCalc;
  #calcGetter = (calcFn, resKey, defaultVal = void 0, surfaceError = false) => {
    const entry = this.raw[resKey];
    if (!entry || typeof entry !== "object" || !entry.started) return defaultVal;
    const measEntry = entry;
    if (surfaceError && measEntry.error) return { error: measEntry.error };
    return this.#measCalc[calcFn](measEntry.results);
  };
  #getV4Reachability = () => this.#calcGetter("getReachability", "v4Reachability");
  #getV4ReachabilityDetails = () => this.#calcGetter("getReachabilityDetails", "v4Reachability");
  #getV6Reachability = () => this.#calcGetter("getReachability", "v6Reachability");
  #getV6ReachabilityDetails = () => this.#calcGetter("getReachabilityDetails", "v6Reachability");
};
var round = (num, decimals = 0) => !num ? num : Math.round(num * 10 ** decimals) / 10 ** decimals;
var latencyPointsParser = (durations) => durations.map((d) => round(d, 2));
var bpsPointsParser = (pnts) => pnts.map((d) => ({
  bytes: +d.bytes,
  bps: round(d.bps)
}));
var packetLossParser = (d) => {
  const details = d;
  return details.error ? void 0 : {
    numMessages: details.numMessagesSent,
    lossRatio: round(details.packetLoss, 4)
  };
};
var resultsParsers = {
  latencyMs: ["getUnloadedLatencyPoints", latencyPointsParser],
  download: ["getDownloadBandwidthPoints", bpsPointsParser],
  upload: ["getUploadBandwidthPoints", bpsPointsParser],
  downLoadedLatencyMs: ["getDownLoadedLatencyPoints", latencyPointsParser],
  upLoadedLatencyMs: ["getUpLoadedLatencyPoints", latencyPointsParser],
  packetLoss: ["getPacketLossDetails", packetLossParser],
  totalDurationMs: ["getTotalDurationMs"]
};
var scoreParser = (d) => ({
  points: d.points,
  classification: d.classificationName
});
var logAimResults = (results, { apiUrl, sessionId }) => {
  const logData = { sessionId };
  Object.entries(resultsParsers).forEach(([logK, [fn, parser]]) => {
    const resolvedParser = parser ?? ((d) => d);
    const val = results[fn]();
    if (val) logData[logK] = resolvedParser(val);
  });
  const scores = results.getScores();
  if (scores) logData.scores = Object.assign({}, ...Object.entries(scores).map(([k, score]) => ({ [k]: scoreParser(score) })));
  fetch(apiUrl, {
    method: "POST",
    body: JSON.stringify(logData)
  });
};
var DEFAULT_OPTIMAL_DOWNLOAD_SIZE = 1e6;
var DEFAULT_OPTIMAL_UPLOAD_SIZE = 1e6;
var OPTIMAL_SIZE_RATIO = 0.5;
var pausableTypes = [
  "latency",
  "latencyUnderLoad",
  "download",
  "upload"
];
var genMeasId = () => `${Math.round(Math.random() * 1e16)}`;
var MeasurementEngine = class {
  constructor(userConfig = {}) {
    this.#config = Object.assign({}, defaultConfig, userConfig, internalConfig);
    this.#results = new Results(this.#config);
    this.#config.autoStart && this.play();
  }
  get results() {
    return this.#results;
  }
  get isRunning() {
    return this.#running;
  }
  get isFinished() {
    return this.#finished;
  }
  onRunningChange = () => {
  };
  onResultsChange = () => {
  };
  onPhaseChange = () => {
  };
  #onFinish = () => {
  };
  set onFinish(f) {
    this.#onFinish = f;
  }
  #onError = () => {
  };
  set onError(f) {
    this.#onError = f;
  }
  pause() {
    const curType = this.#curType();
    curType && pausableTypes.includes(curType) && this.#curEngine?.pause?.();
    this.#setRunning(false);
  }
  play() {
    if (!this.#running) {
      performance.clearResourceTimings();
      performance.setResourceTimingBufferSize(1e4);
      this.#setRunning(true);
      this.#next();
    }
  }
  restart() {
    this.#clear();
    this.play();
  }
  #config;
  #results;
  #measurementId = genMeasId();
  #curMsmIdx = -1;
  #curEngine;
  #optimalDownloadChunkSize = DEFAULT_OPTIMAL_DOWNLOAD_SIZE;
  #optimalUploadChunkSize = DEFAULT_OPTIMAL_UPLOAD_SIZE;
  #startTime;
  #accumulatedRuntimeMs = 0;
  #running = false;
  #finished = false;
  #setRunning(running) {
    if (running !== this.#running) {
      this.#running = running;
      this.onRunningChange(this.#running);
    }
    if (running) this.#startTime = performance.now();
    else if (typeof this.#startTime !== "undefined") {
      this.#accumulatedRuntimeMs += performance.now() - this.#startTime;
      this.#startTime = void 0;
    }
  }
  #setFinished(finished) {
    if (finished !== this.#finished) {
      this.#finished = finished;
      if (finished) {
        this.#results.raw.totalDurationMs = this.#accumulatedRuntimeMs;
        setTimeout(() => this.#onFinish(this.results));
      }
    }
  }
  #curType() {
    return this.#curMsmIdx < 0 || this.#curMsmIdx >= this.#config.measurements.length ? null : this.#config.measurements[this.#curMsmIdx].type;
  }
  #curTypeResults() {
    const type = this.#curType();
    if (!type) return void 0;
    return this.#results.raw[type] || void 0;
  }
  #clear() {
    this.#destroyCurEngine();
    this.#measurementId = genMeasId();
    this.#curMsmIdx = -1;
    this.#curEngine = void 0;
    this.#setRunning(false);
    this.#setFinished(false);
    this.#results.clear();
    this.#accumulatedRuntimeMs = 0;
  }
  #destroyCurEngine() {
    const engine = this.#curEngine;
    if (!engine) return;
    engine.onFinished = engine.onConnectionError = engine.onMsgReceived = engine.onCredentialsFailure = engine.onMeasurementResult = () => {
    };
    const curType = this.#curType();
    curType && pausableTypes.includes(curType) && engine.pause?.();
  }
  #next() {
    const resumeType = this.#curType();
    const resumeResults = this.#curTypeResults();
    if (resumeType && pausableTypes.includes(resumeType) && resumeResults && resumeResults.started && !resumeResults.finished && !resumeResults.finishedCurrentRound && !resumeResults.error) {
      this.#curEngine?.play?.();
      return;
    }
    this.#curMsmIdx++;
    if (this.#curMsmIdx >= this.#config.measurements.length) {
      this.#setRunning(false);
      this.#setFinished(true);
      return;
    }
    const { type, ...msmConfig } = this.#config.measurements[this.#curMsmIdx];
    const msmResults = this.#curTypeResults();
    this.onPhaseChange({
      measurementId: this.#curMsmIdx,
      measurement: {
        type,
        ...msmConfig
      }
    });
    const { downloadApiUrl, uploadApiUrl, estimatedServerTime } = this.#config;
    let engine;
    switch (type) {
      case "v4Reachability":
      case "v6Reachability":
        engine = new ReachabilityEngine(`https://${msmConfig.host}`, { fetchOptions: {
          method: "GET",
          mode: "no-cors"
        } });
        engine.onFinished = (result) => {
          const r = result;
          msmResults.finished = true;
          msmResults.results = {
            host: msmConfig.host,
            ...r
          };
          this.onResultsChange({ type });
          this.#next();
        };
        break;
      case "rpki":
        engine = new ReachabilityEngine(`https://${this.#config.rpkiInvalidHost}`, { timeout: 5e3 });
        engine.onFinished = (result) => {
          const r = result;
          (r.response ? r.response.json() : Promise.resolve()).then((response) => {
            msmResults.finished = true;
            msmResults.results = {
              host: this.#config.rpkiInvalidHost,
              filteringInvalids: !r.reachable,
              ...response ? {
                asn: response.asn,
                name: response.name
              } : {}
            };
            this.onResultsChange({ type });
            this.#next();
          });
        };
        break;
      case "nxdomain":
        engine = new ReachabilityEngine(`https://${msmConfig.nxhost}`, { fetchOptions: { mode: "no-cors" } });
        engine.onFinished = (result) => {
          const r = result;
          msmResults.finished = true;
          msmResults.results = {
            host: msmConfig.nxhost,
            reachable: r.reachable
          };
          this.onResultsChange({ type });
          this.#next();
        };
        break;
      case "packetLoss":
      case "packetLossUnderLoad":
        {
          msmResults.finished = false;
          const { numPackets: numMsgs, ...ptCfg } = msmConfig;
          const { turnServerUri, turnServerCredsApiUrl: turnServerCredsApi, turnServerUser, turnServerPass, includeCredentials } = this.#config;
          engine = new PacketLossUnderLoadEngine({
            turnServerUri,
            turnServerCredsApi,
            turnServerCredsApiIncludeCredentials: includeCredentials,
            turnServerUser: turnServerUser ?? void 0,
            turnServerPass: turnServerPass ?? void 0,
            numMsgs,
            downloadChunkSize: msmConfig.loadDown ? this.#optimalDownloadChunkSize : void 0,
            uploadChunkSize: msmConfig.loadUp ? this.#optimalUploadChunkSize : void 0,
            downloadApiUrl,
            uploadApiUrl,
            ...ptCfg
          });
        }
        engine.onMsgReceived = () => {
          msmResults.results = Object.assign({}, engine.results);
          this.onResultsChange({ type });
        };
        engine.onFinished = () => {
          msmResults.finished = true;
          this.onResultsChange({ type });
          this.#next();
        };
        engine.onConnectionError = (e) => {
          msmResults.error = e;
          this.onResultsChange({ type });
          this.#onError(`Connection error while measuring packet loss: ${e}`);
          this.#next();
        };
        engine.onCredentialsFailure = () => {
          msmResults.error = "unable to get turn server credentials";
          this.onResultsChange({ type });
          this.#onError("Error while measuring packet loss: unable to get turn server credentials.");
          this.#next();
        };
        break;
      case "latency":
      case "latencyUnderLoad":
        msmResults.finished = false;
        engine = new LoggingBandwidthEngine([{
          dir: "down",
          bytes: 0,
          count: msmConfig.numPackets,
          bypassMinDuration: true
        }], {
          downloadApiUrl,
          uploadApiUrl,
          estimatedServerTime,
          logApiUrl: this.#config.logMeasurementApiUrl ?? void 0,
          measurementId: this.#measurementId,
          sessionId: this.#config.sessionId,
          downloadChunkSize: msmConfig.loadDown ? this.#optimalDownloadChunkSize : void 0,
          uploadChunkSize: msmConfig.loadUp ? this.#optimalUploadChunkSize : void 0
        });
        engine.fetchOptions = { credentials: this.#config.includeCredentials ? "include" : void 0 };
        engine.abortRequestDuration = this.#config.bandwidthAbortRequestDuration;
        engine.onMeasurementResult = engine.onNewMeasurementStarted = (_meas, results) => {
          msmResults.results = Object.assign({}, results.down[0]);
          this.onResultsChange({ type });
        };
        engine.onFinished = () => {
          msmResults.finished = true;
          this.onResultsChange({ type });
          this.#running && this.#next();
        };
        engine.onConnectionError = (e) => {
          msmResults.error = e;
          this.onResultsChange({ type });
          this.#onError(`Connection error while measuring latency: ${e}`);
          this.#next();
        };
        engine.play();
        break;
      case "download":
      case "upload":
        if (msmResults.finished || msmResults.error) this.#next();
        else {
          delete msmResults.finishedCurrentRound;
          const measureParallelLatency = this.#config[`measure${type === "download" ? "Down" : "Up"}loadLoadedLatency`];
          engine = new LoggingBandwidthEngine([{
            dir: type === "download" ? "down" : "up",
            ...msmConfig
          }], {
            downloadApiUrl,
            uploadApiUrl,
            estimatedServerTime,
            logApiUrl: this.#config.logMeasurementApiUrl ?? void 0,
            measurementId: this.#measurementId,
            measureParallelLatency,
            parallelLatencyThrottleMs: this.#config.loadedLatencyThrottle,
            sessionId: this.#config.sessionId
          });
          engine.fetchOptions = { credentials: this.#config.includeCredentials ? "include" : void 0 };
          engine.finishRequestDuration = this.#config.bandwidthFinishRequestDuration;
          engine.abortRequestDuration = this.#config.bandwidthAbortRequestDuration;
          engine.onNewMeasurementStarted = (...args) => {
            const { count, bytes } = args[0];
            const res = msmResults.results = Object.assign({}, msmResults.results);
            !res.hasOwnProperty(bytes) && (res[bytes] = {
              timings: [],
              numMeasurements: 0,
              sideLatency: measureParallelLatency ? [] : void 0
            });
            const bucket = res[bytes];
            if (bucket.numMeasurements - bucket.timings.length !== count) {
              bucket.numMeasurements += count;
              this.onResultsChange({ type });
            }
          };
          engine.onMeasurementResult = (...args) => {
            const { bytes, ...timing } = args[0];
            msmResults.results[bytes].timings.push(timing);
            msmResults.results = Object.assign({}, msmResults.results);
            this.onResultsChange({ type });
          };
          engine.onParallelLatencyResult = (res) => {
            msmResults.results[msmConfig.bytes].sideLatency.push(res);
            msmResults.results = Object.assign({}, msmResults.results);
            this.onResultsChange({ type });
          };
          engine.onFinished = (results) => {
            const bwResults = results;
            const isLastMsmOfType = !this.#config.measurements.slice(this.#curMsmIdx + 1).map((d) => d.type).includes(type);
            const minDuration = Math.min(...Object.values(type === "download" ? bwResults.down : bwResults.up).slice(-1)[0].timings.map((d) => d.duration));
            if (!(isLastMsmOfType || !msmConfig.bypassMinDuration && minDuration > this.#config.bandwidthFinishRequestDuration)) msmResults.finishedCurrentRound = true;
            else {
              msmResults.finished = true;
              this.onResultsChange({ type });
              const optimalSize = Object.keys(msmResults.results).map((n) => +n).sort((a, b) => b - a)[0] * OPTIMAL_SIZE_RATIO;
              type === "download" && (this.#optimalDownloadChunkSize = optimalSize);
              type === "upload" && (this.#optimalUploadChunkSize = optimalSize);
            }
            this.#running && this.#next();
          };
          engine.onConnectionError = (e) => {
            msmResults.error = e;
            this.onResultsChange({ type });
            this.#onError(`Connection error while measuring ${type}: ${e}`);
            this.#next();
          };
          engine.play();
        }
        break;
      default:
    }
    this.#curEngine = engine;
    msmResults.started = true;
    this.onResultsChange({ type });
  }
};
var SpeedTestEngine = class extends MeasurementEngine {
  constructor(userConfig = {}) {
    super(userConfig);
    super.onFinish = this.#logFinalResults;
    const config = Object.assign({}, defaultConfig, userConfig, internalConfig);
    this.#logAimApiUrl = config.logAimApiUrl;
    this.#sessionId = config.sessionId;
  }
  set onFinish(onFinish) {
    super.onFinish = (results) => {
      onFinish(results);
      this.#logFinalResults(results);
    };
  }
  #logAimApiUrl;
  #sessionId;
  #logFinalResults = (results) => {
    this.#logAimApiUrl && logAimResults(results, {
      apiUrl: this.#logAimApiUrl,
      sessionId: this.#sessionId
    });
  };
};

// src/browser-app.js
var MEASUREMENTS = [
  { type: "latency", numPackets: 18 },
  { type: "download", bytes: 256e3, count: 1, bypassMinDuration: true },
  { type: "download", bytes: 1e6, count: 1 },
  { type: "download", bytes: 4e6, count: 1 },
  { type: "download", bytes: 12e6, count: 1 },
  { type: "download", bytes: 24e6, count: 1 },
  { type: "download", bytes: 48e6, count: 1 },
  { type: "upload", bytes: 256e3, count: 1, bypassMinDuration: true },
  { type: "upload", bytes: 1e6, count: 1 },
  { type: "upload", bytes: 4e6, count: 1 },
  { type: "upload", bytes: 12e6, count: 1 },
  { type: "upload", bytes: 24e6, count: 1 },
  { type: "upload", bytes: 48e6, count: 1 }
];
var STAGE_PROGRESS = {
  starting: { ceiling: 6 },
  latency: { ceiling: 22 },
  download: { ceiling: 62 },
  upload: { ceiling: 96 },
  finishing: { ceiling: 99 }
};
var EXPECTED_STAGE_MS = {
  starting: 900,
  latency: 2800,
  download: 9e3,
  upload: 12e3,
  finishing: 1600
};
var elements = Object.fromEntries(
  [
    "domain-label",
    "run-button",
    "status-text",
    "progress-label",
    "progress-fill",
    "download-value",
    "upload-value",
    "latency-value",
    "jitter-value",
    "download-latency-value",
    "upload-latency-value"
  ].map((id) => [toKey(id), document.getElementById(id)])
);
var state = {
  progress: 0,
  progressTimer: null,
  stage: "starting",
  stageStartProgress: 0,
  stageStartedAt: 0,
  test: null
};
elements.domainLabel.textContent = window.location.hostname;
elements.runButton.addEventListener("click", runTest);
function runTest() {
  if (state.test?.isRunning) return;
  resetResults();
  elements.runButton.disabled = true;
  elements.runButton.textContent = "Running";
  const test = new SpeedTestEngine({
    autoStart: false,
    downloadApiUrl: `${window.location.origin}/api/download`,
    uploadApiUrl: `${window.location.origin}/api/upload`,
    measurements: MEASUREMENTS,
    measureDownloadLoadedLatency: true,
    measureUploadLoadedLatency: true,
    loadedLatencyThrottle: 140,
    bandwidthFinishRequestDuration: 1200,
    bandwidthMinRequestDuration: 10,
    estimatedServerTime: 0
  });
  state.test = test;
  test.onRunningChange = (running) => {
    if (!running && !test.isFinished) {
      stopProgressAnimation();
      elements.runButton.disabled = false;
      elements.runButton.textContent = "Retest";
    }
  };
  test.onResultsChange = ({ type }) => {
    setStage(stageFor(type), statusFor(type));
    renderResults(test.results);
  };
  test.onError = (error) => {
    stopProgressAnimation();
    updateProgress("Test failed. Please retry.", state.progress);
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Retest";
    console.error(error);
  };
  test.onFinish = (results) => {
    stopProgressAnimation();
    renderResults(results);
    updateProgress("Complete", 100);
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Retest";
  };
  updateProgress("Starting", 0);
  setStage("starting", "Starting");
  startProgressAnimation();
  test.play();
}
function renderResults(results) {
  elements.downloadValue.textContent = formatNumber(observedBandwidthMbps(results, "download"));
  elements.uploadValue.textContent = formatNumber(observedBandwidthMbps(results, "upload"));
  elements.latencyValue.textContent = formatNumber(results.getUnloadedLatency?.());
  elements.jitterValue.textContent = formatNumber(results.getUnloadedJitter?.());
  elements.downloadLatencyValue.textContent = formatNumber(results.getDownLoadedLatency?.());
  elements.uploadLatencyValue.textContent = formatNumber(results.getUpLoadedLatency?.());
}
function resetResults() {
  stopProgressAnimation();
  for (const key of [
    "downloadValue",
    "uploadValue",
    "latencyValue",
    "jitterValue",
    "downloadLatencyValue",
    "uploadLatencyValue"
  ]) {
    elements[key].textContent = "-";
  }
  updateProgress("Starting", 0);
}
function stageFor(type) {
  if (type === "latency") return "latency";
  if (type === "download") return "download";
  if (type === "upload") return "upload";
  return "finishing";
}
function statusFor(type) {
  if (type === "latency") return "Measuring latency";
  if (type === "download") return "Measuring download";
  if (type === "upload") return "Measuring upload";
  return "Running";
}
function setStage(stage, label) {
  if (stage !== state.stage) {
    state.stage = stage;
    state.stageStartProgress = state.progress;
    state.stageStartedAt = performance.now();
  }
  elements.statusText.textContent = label;
}
function startProgressAnimation() {
  stopProgressAnimation();
  state.stageStartedAt = performance.now();
  state.progressTimer = window.setInterval(advanceProgress, 120);
}
function stopProgressAnimation() {
  if (state.progressTimer) {
    window.clearInterval(state.progressTimer);
    state.progressTimer = null;
  }
}
function advanceProgress() {
  const stage = STAGE_PROGRESS[state.stage] || STAGE_PROGRESS.finishing;
  const expectedMs = EXPECTED_STAGE_MS[state.stage] || EXPECTED_STAGE_MS.finishing;
  const elapsed = performance.now() - state.stageStartedAt;
  const ratio = 1 - Math.exp(-elapsed / expectedMs);
  const target = state.stageStartProgress + (stage.ceiling - state.stageStartProgress) * ratio;
  const next = Math.max(state.progress, Math.min(stage.ceiling, target));
  updateProgress(elements.statusText.textContent, Math.round(next));
}
function updateProgress(label, percent) {
  const bounded = Math.max(0, Math.min(100, percent));
  state.progress = bounded;
  elements.statusText.textContent = label;
  elements.progressLabel.textContent = `${bounded}%`;
  elements.progressFill.style.width = `${bounded}%`;
}
function bpsToMbps(value) {
  if (!Number.isFinite(value)) return null;
  return value / 1e6;
}
function observedBandwidthMbps(results, direction) {
  const finalBps = direction === "download" ? results.getDownloadBandwidth?.() : results.getUploadBandwidth?.();
  if (Number.isFinite(finalBps) && finalBps > 0) return bpsToMbps(finalBps);
  const points = direction === "download" ? results.getDownloadBandwidthPoints?.() : results.getUploadBandwidthPoints?.();
  const latestPositive = [...points || []].reverse().find((point) => point?.bps > 0);
  return bpsToMbps(latestPositive?.bps);
}
function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(Math.min(digits, 1));
  return value.toFixed(digits);
}
function toKey(id) {
  return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
