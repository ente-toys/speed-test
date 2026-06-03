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
  const cache2 = /* @__PURE__ */ new Map();
  return (numBytes) => {
    if (!cache2.has(numBytes)) cache2.set(numBytes, "0".repeat(numBytes));
    return cache2.get(numBytes);
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

// node_modules/html-to-image/es/util.js
function resolveUrl(url, baseUrl) {
  if (url.match(/^[a-z]+:\/\//i)) {
    return url;
  }
  if (url.match(/^\/\//)) {
    return window.location.protocol + url;
  }
  if (url.match(/^[a-z]+:/i)) {
    return url;
  }
  const doc = document.implementation.createHTMLDocument();
  const base = doc.createElement("base");
  const a = doc.createElement("a");
  doc.head.appendChild(base);
  doc.body.appendChild(a);
  if (baseUrl) {
    base.href = baseUrl;
  }
  a.href = url;
  return a.href;
}
var uuid = /* @__PURE__ */ (() => {
  let counter = 0;
  const random = () => (
    // eslint-disable-next-line no-bitwise
    `0000${(Math.random() * 36 ** 4 << 0).toString(36)}`.slice(-4)
  );
  return () => {
    counter += 1;
    return `u${random()}${counter}`;
  };
})();
function toArray(arrayLike) {
  const arr = [];
  for (let i = 0, l = arrayLike.length; i < l; i++) {
    arr.push(arrayLike[i]);
  }
  return arr;
}
var styleProps = null;
function getStyleProperties(options = {}) {
  if (styleProps) {
    return styleProps;
  }
  if (options.includeStyleProperties) {
    styleProps = options.includeStyleProperties;
    return styleProps;
  }
  styleProps = toArray(window.getComputedStyle(document.documentElement));
  return styleProps;
}
function px(node, styleProperty) {
  const win = node.ownerDocument.defaultView || window;
  const val = win.getComputedStyle(node).getPropertyValue(styleProperty);
  return val ? parseFloat(val.replace("px", "")) : 0;
}
function getNodeWidth(node) {
  const leftBorder = px(node, "border-left-width");
  const rightBorder = px(node, "border-right-width");
  return node.clientWidth + leftBorder + rightBorder;
}
function getNodeHeight(node) {
  const topBorder = px(node, "border-top-width");
  const bottomBorder = px(node, "border-bottom-width");
  return node.clientHeight + topBorder + bottomBorder;
}
function getImageSize(targetNode, options = {}) {
  const width = options.width || getNodeWidth(targetNode);
  const height = options.height || getNodeHeight(targetNode);
  return { width, height };
}
function getPixelRatio() {
  let ratio;
  let FINAL_PROCESS;
  try {
    FINAL_PROCESS = process;
  } catch (e) {
  }
  const val = FINAL_PROCESS && FINAL_PROCESS.env ? FINAL_PROCESS.env.devicePixelRatio : null;
  if (val) {
    ratio = parseInt(val, 10);
    if (Number.isNaN(ratio)) {
      ratio = 1;
    }
  }
  return ratio || window.devicePixelRatio || 1;
}
var canvasDimensionLimit = 16384;
function checkCanvasDimensions(canvas) {
  if (canvas.width > canvasDimensionLimit || canvas.height > canvasDimensionLimit) {
    if (canvas.width > canvasDimensionLimit && canvas.height > canvasDimensionLimit) {
      if (canvas.width > canvas.height) {
        canvas.height *= canvasDimensionLimit / canvas.width;
        canvas.width = canvasDimensionLimit;
      } else {
        canvas.width *= canvasDimensionLimit / canvas.height;
        canvas.height = canvasDimensionLimit;
      }
    } else if (canvas.width > canvasDimensionLimit) {
      canvas.height *= canvasDimensionLimit / canvas.width;
      canvas.width = canvasDimensionLimit;
    } else {
      canvas.width *= canvasDimensionLimit / canvas.height;
      canvas.height = canvasDimensionLimit;
    }
  }
}
function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      img.decode().then(() => {
        requestAnimationFrame(() => resolve(img));
      });
    };
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = url;
  });
}
async function svgToDataURL(svg) {
  return Promise.resolve().then(() => new XMLSerializer().serializeToString(svg)).then(encodeURIComponent).then((html) => `data:image/svg+xml;charset=utf-8,${html}`);
}
async function nodeToDataURL(node, width, height) {
  const xmlns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(xmlns, "svg");
  const foreignObject = document.createElementNS(xmlns, "foreignObject");
  svg.setAttribute("width", `${width}`);
  svg.setAttribute("height", `${height}`);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  foreignObject.setAttribute("width", "100%");
  foreignObject.setAttribute("height", "100%");
  foreignObject.setAttribute("x", "0");
  foreignObject.setAttribute("y", "0");
  foreignObject.setAttribute("externalResourcesRequired", "true");
  svg.appendChild(foreignObject);
  foreignObject.appendChild(node);
  return svgToDataURL(svg);
}
var isInstanceOfElement = (node, instance) => {
  if (node instanceof instance)
    return true;
  const nodePrototype = Object.getPrototypeOf(node);
  if (nodePrototype === null)
    return false;
  return nodePrototype.constructor.name === instance.name || isInstanceOfElement(nodePrototype, instance);
};

// node_modules/html-to-image/es/clone-pseudos.js
function formatCSSText(style) {
  const content = style.getPropertyValue("content");
  return `${style.cssText} content: '${content.replace(/'|"/g, "")}';`;
}
function formatCSSProperties(style, options) {
  return getStyleProperties(options).map((name) => {
    const value = style.getPropertyValue(name);
    const priority = style.getPropertyPriority(name);
    return `${name}: ${value}${priority ? " !important" : ""};`;
  }).join(" ");
}
function getPseudoElementStyle(className, pseudo, style, options) {
  const selector = `.${className}:${pseudo}`;
  const cssText = style.cssText ? formatCSSText(style) : formatCSSProperties(style, options);
  return document.createTextNode(`${selector}{${cssText}}`);
}
function clonePseudoElement(nativeNode, clonedNode, pseudo, options) {
  const style = window.getComputedStyle(nativeNode, pseudo);
  const content = style.getPropertyValue("content");
  if (content === "" || content === "none") {
    return;
  }
  const className = uuid();
  try {
    clonedNode.className = `${clonedNode.className} ${className}`;
  } catch (err) {
    return;
  }
  const styleElement = document.createElement("style");
  styleElement.appendChild(getPseudoElementStyle(className, pseudo, style, options));
  clonedNode.appendChild(styleElement);
}
function clonePseudoElements(nativeNode, clonedNode, options) {
  clonePseudoElement(nativeNode, clonedNode, ":before", options);
  clonePseudoElement(nativeNode, clonedNode, ":after", options);
}

// node_modules/html-to-image/es/mimes.js
var WOFF = "application/font-woff";
var JPEG = "image/jpeg";
var mimes = {
  woff: WOFF,
  woff2: WOFF,
  ttf: "application/font-truetype",
  eot: "application/vnd.ms-fontobject",
  png: "image/png",
  jpg: JPEG,
  jpeg: JPEG,
  gif: "image/gif",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  webp: "image/webp"
};
function getExtension(url) {
  const match = /\.([^./]*?)$/g.exec(url);
  return match ? match[1] : "";
}
function getMimeType(url) {
  const extension = getExtension(url).toLowerCase();
  return mimes[extension] || "";
}

// node_modules/html-to-image/es/dataurl.js
function getContentFromDataUrl(dataURL) {
  return dataURL.split(/,/)[1];
}
function isDataUrl(url) {
  return url.search(/^(data:)/) !== -1;
}
function makeDataUrl(content, mimeType) {
  return `data:${mimeType};base64,${content}`;
}
async function fetchAsDataURL(url, init, process2) {
  const res = await fetch(url, init);
  if (res.status === 404) {
    throw new Error(`Resource "${res.url}" not found`);
  }
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onloadend = () => {
      try {
        resolve(process2({ res, result: reader.result }));
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsDataURL(blob);
  });
}
var cache = {};
function getCacheKey(url, contentType, includeQueryParams) {
  let key = url.replace(/\?.*/, "");
  if (includeQueryParams) {
    key = url;
  }
  if (/ttf|otf|eot|woff2?/i.test(key)) {
    key = key.replace(/.*\//, "");
  }
  return contentType ? `[${contentType}]${key}` : key;
}
async function resourceToDataURL(resourceUrl, contentType, options) {
  const cacheKey = getCacheKey(resourceUrl, contentType, options.includeQueryParams);
  if (cache[cacheKey] != null) {
    return cache[cacheKey];
  }
  if (options.cacheBust) {
    resourceUrl += (/\?/.test(resourceUrl) ? "&" : "?") + (/* @__PURE__ */ new Date()).getTime();
  }
  let dataURL;
  try {
    const content = await fetchAsDataURL(resourceUrl, options.fetchRequestInit, ({ res, result }) => {
      if (!contentType) {
        contentType = res.headers.get("Content-Type") || "";
      }
      return getContentFromDataUrl(result);
    });
    dataURL = makeDataUrl(content, contentType);
  } catch (error) {
    dataURL = options.imagePlaceholder || "";
    let msg = `Failed to fetch resource: ${resourceUrl}`;
    if (error) {
      msg = typeof error === "string" ? error : error.message;
    }
    if (msg) {
      console.warn(msg);
    }
  }
  cache[cacheKey] = dataURL;
  return dataURL;
}

// node_modules/html-to-image/es/clone-node.js
async function cloneCanvasElement(canvas) {
  const dataURL = canvas.toDataURL();
  if (dataURL === "data:,") {
    return canvas.cloneNode(false);
  }
  return createImage(dataURL);
}
async function cloneVideoElement(video, options) {
  if (video.currentSrc) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    ctx === null || ctx === void 0 ? void 0 : ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataURL2 = canvas.toDataURL();
    return createImage(dataURL2);
  }
  const poster = video.poster;
  const contentType = getMimeType(poster);
  const dataURL = await resourceToDataURL(poster, contentType, options);
  return createImage(dataURL);
}
async function cloneIFrameElement(iframe, options) {
  var _a;
  try {
    if ((_a = iframe === null || iframe === void 0 ? void 0 : iframe.contentDocument) === null || _a === void 0 ? void 0 : _a.body) {
      return await cloneNode(iframe.contentDocument.body, options, true);
    }
  } catch (_b) {
  }
  return iframe.cloneNode(false);
}
async function cloneSingleNode(node, options) {
  if (isInstanceOfElement(node, HTMLCanvasElement)) {
    return cloneCanvasElement(node);
  }
  if (isInstanceOfElement(node, HTMLVideoElement)) {
    return cloneVideoElement(node, options);
  }
  if (isInstanceOfElement(node, HTMLIFrameElement)) {
    return cloneIFrameElement(node, options);
  }
  return node.cloneNode(isSVGElement(node));
}
var isSlotElement = (node) => node.tagName != null && node.tagName.toUpperCase() === "SLOT";
var isSVGElement = (node) => node.tagName != null && node.tagName.toUpperCase() === "SVG";
async function cloneChildren(nativeNode, clonedNode, options) {
  var _a, _b;
  if (isSVGElement(clonedNode)) {
    return clonedNode;
  }
  let children = [];
  if (isSlotElement(nativeNode) && nativeNode.assignedNodes) {
    children = toArray(nativeNode.assignedNodes());
  } else if (isInstanceOfElement(nativeNode, HTMLIFrameElement) && ((_a = nativeNode.contentDocument) === null || _a === void 0 ? void 0 : _a.body)) {
    children = toArray(nativeNode.contentDocument.body.childNodes);
  } else {
    children = toArray(((_b = nativeNode.shadowRoot) !== null && _b !== void 0 ? _b : nativeNode).childNodes);
  }
  if (children.length === 0 || isInstanceOfElement(nativeNode, HTMLVideoElement)) {
    return clonedNode;
  }
  await children.reduce((deferred, child) => deferred.then(() => cloneNode(child, options)).then((clonedChild) => {
    if (clonedChild) {
      clonedNode.appendChild(clonedChild);
    }
  }), Promise.resolve());
  return clonedNode;
}
function cloneCSSStyle(nativeNode, clonedNode, options) {
  const targetStyle = clonedNode.style;
  if (!targetStyle) {
    return;
  }
  const sourceStyle = window.getComputedStyle(nativeNode);
  if (sourceStyle.cssText) {
    targetStyle.cssText = sourceStyle.cssText;
    targetStyle.transformOrigin = sourceStyle.transformOrigin;
  } else {
    getStyleProperties(options).forEach((name) => {
      let value = sourceStyle.getPropertyValue(name);
      if (name === "font-size" && value.endsWith("px")) {
        const reducedFont = Math.floor(parseFloat(value.substring(0, value.length - 2))) - 0.1;
        value = `${reducedFont}px`;
      }
      if (isInstanceOfElement(nativeNode, HTMLIFrameElement) && name === "display" && value === "inline") {
        value = "block";
      }
      if (name === "d" && clonedNode.getAttribute("d")) {
        value = `path(${clonedNode.getAttribute("d")})`;
      }
      targetStyle.setProperty(name, value, sourceStyle.getPropertyPriority(name));
    });
  }
}
function cloneInputValue(nativeNode, clonedNode) {
  if (isInstanceOfElement(nativeNode, HTMLTextAreaElement)) {
    clonedNode.innerHTML = nativeNode.value;
  }
  if (isInstanceOfElement(nativeNode, HTMLInputElement)) {
    clonedNode.setAttribute("value", nativeNode.value);
  }
}
function cloneSelectValue(nativeNode, clonedNode) {
  if (isInstanceOfElement(nativeNode, HTMLSelectElement)) {
    const clonedSelect = clonedNode;
    const selectedOption = Array.from(clonedSelect.children).find((child) => nativeNode.value === child.getAttribute("value"));
    if (selectedOption) {
      selectedOption.setAttribute("selected", "");
    }
  }
}
function decorate(nativeNode, clonedNode, options) {
  if (isInstanceOfElement(clonedNode, Element)) {
    cloneCSSStyle(nativeNode, clonedNode, options);
    clonePseudoElements(nativeNode, clonedNode, options);
    cloneInputValue(nativeNode, clonedNode);
    cloneSelectValue(nativeNode, clonedNode);
  }
  return clonedNode;
}
async function ensureSVGSymbols(clone, options) {
  const uses = clone.querySelectorAll ? clone.querySelectorAll("use") : [];
  if (uses.length === 0) {
    return clone;
  }
  const processedDefs = {};
  for (let i = 0; i < uses.length; i++) {
    const use = uses[i];
    const id = use.getAttribute("xlink:href");
    if (id) {
      const exist = clone.querySelector(id);
      const definition = document.querySelector(id);
      if (!exist && definition && !processedDefs[id]) {
        processedDefs[id] = await cloneNode(definition, options, true);
      }
    }
  }
  const nodes = Object.values(processedDefs);
  if (nodes.length) {
    const ns = "http://www.w3.org/1999/xhtml";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("xmlns", ns);
    svg.style.position = "absolute";
    svg.style.width = "0";
    svg.style.height = "0";
    svg.style.overflow = "hidden";
    svg.style.display = "none";
    const defs = document.createElementNS(ns, "defs");
    svg.appendChild(defs);
    for (let i = 0; i < nodes.length; i++) {
      defs.appendChild(nodes[i]);
    }
    clone.appendChild(svg);
  }
  return clone;
}
async function cloneNode(node, options, isRoot) {
  if (!isRoot && options.filter && !options.filter(node)) {
    return null;
  }
  return Promise.resolve(node).then((clonedNode) => cloneSingleNode(clonedNode, options)).then((clonedNode) => cloneChildren(node, clonedNode, options)).then((clonedNode) => decorate(node, clonedNode, options)).then((clonedNode) => ensureSVGSymbols(clonedNode, options));
}

// node_modules/html-to-image/es/embed-resources.js
var URL_REGEX = /url\((['"]?)([^'"]+?)\1\)/g;
var URL_WITH_FORMAT_REGEX = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g;
var FONT_SRC_REGEX = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
function toRegex(url) {
  const escaped = url.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
  return new RegExp(`(url\\(['"]?)(${escaped})(['"]?\\))`, "g");
}
function parseURLs(cssText) {
  const urls = [];
  cssText.replace(URL_REGEX, (raw, quotation, url) => {
    urls.push(url);
    return raw;
  });
  return urls.filter((url) => !isDataUrl(url));
}
async function embed(cssText, resourceURL, baseURL, options, getContentFromUrl) {
  try {
    const resolvedURL = baseURL ? resolveUrl(resourceURL, baseURL) : resourceURL;
    const contentType = getMimeType(resourceURL);
    let dataURL;
    if (getContentFromUrl) {
      const content = await getContentFromUrl(resolvedURL);
      dataURL = makeDataUrl(content, contentType);
    } else {
      dataURL = await resourceToDataURL(resolvedURL, contentType, options);
    }
    return cssText.replace(toRegex(resourceURL), `$1${dataURL}$3`);
  } catch (error) {
  }
  return cssText;
}
function filterPreferredFontFormat(str, { preferredFontFormat }) {
  return !preferredFontFormat ? str : str.replace(FONT_SRC_REGEX, (match) => {
    while (true) {
      const [src, , format] = URL_WITH_FORMAT_REGEX.exec(match) || [];
      if (!format) {
        return "";
      }
      if (format === preferredFontFormat) {
        return `src: ${src};`;
      }
    }
  });
}
function shouldEmbed(url) {
  return url.search(URL_REGEX) !== -1;
}
async function embedResources(cssText, baseUrl, options) {
  if (!shouldEmbed(cssText)) {
    return cssText;
  }
  const filteredCSSText = filterPreferredFontFormat(cssText, options);
  const urls = parseURLs(filteredCSSText);
  return urls.reduce((deferred, url) => deferred.then((css) => embed(css, url, baseUrl, options)), Promise.resolve(filteredCSSText));
}

// node_modules/html-to-image/es/embed-images.js
async function embedProp(propName, node, options) {
  var _a;
  const propValue = (_a = node.style) === null || _a === void 0 ? void 0 : _a.getPropertyValue(propName);
  if (propValue) {
    const cssString = await embedResources(propValue, null, options);
    node.style.setProperty(propName, cssString, node.style.getPropertyPriority(propName));
    return true;
  }
  return false;
}
async function embedBackground(clonedNode, options) {
  ;
  await embedProp("background", clonedNode, options) || await embedProp("background-image", clonedNode, options);
  await embedProp("mask", clonedNode, options) || await embedProp("-webkit-mask", clonedNode, options) || await embedProp("mask-image", clonedNode, options) || await embedProp("-webkit-mask-image", clonedNode, options);
}
async function embedImageNode(clonedNode, options) {
  const isImageElement = isInstanceOfElement(clonedNode, HTMLImageElement);
  if (!(isImageElement && !isDataUrl(clonedNode.src)) && !(isInstanceOfElement(clonedNode, SVGImageElement) && !isDataUrl(clonedNode.href.baseVal))) {
    return;
  }
  const url = isImageElement ? clonedNode.src : clonedNode.href.baseVal;
  const dataURL = await resourceToDataURL(url, getMimeType(url), options);
  await new Promise((resolve, reject) => {
    clonedNode.onload = resolve;
    clonedNode.onerror = options.onImageErrorHandler ? (...attributes) => {
      try {
        resolve(options.onImageErrorHandler(...attributes));
      } catch (error) {
        reject(error);
      }
    } : reject;
    const image = clonedNode;
    if (image.decode) {
      image.decode = resolve;
    }
    if (image.loading === "lazy") {
      image.loading = "eager";
    }
    if (isImageElement) {
      clonedNode.srcset = "";
      clonedNode.src = dataURL;
    } else {
      clonedNode.href.baseVal = dataURL;
    }
  });
}
async function embedChildren(clonedNode, options) {
  const children = toArray(clonedNode.childNodes);
  const deferreds = children.map((child) => embedImages(child, options));
  await Promise.all(deferreds).then(() => clonedNode);
}
async function embedImages(clonedNode, options) {
  if (isInstanceOfElement(clonedNode, Element)) {
    await embedBackground(clonedNode, options);
    await embedImageNode(clonedNode, options);
    await embedChildren(clonedNode, options);
  }
}

// node_modules/html-to-image/es/apply-style.js
function applyStyle(node, options) {
  const { style } = node;
  if (options.backgroundColor) {
    style.backgroundColor = options.backgroundColor;
  }
  if (options.width) {
    style.width = `${options.width}px`;
  }
  if (options.height) {
    style.height = `${options.height}px`;
  }
  const manual = options.style;
  if (manual != null) {
    Object.keys(manual).forEach((key) => {
      style[key] = manual[key];
    });
  }
  return node;
}

// node_modules/html-to-image/es/embed-webfonts.js
var cssFetchCache = {};
async function fetchCSS(url) {
  let cache2 = cssFetchCache[url];
  if (cache2 != null) {
    return cache2;
  }
  const res = await fetch(url);
  const cssText = await res.text();
  cache2 = { url, cssText };
  cssFetchCache[url] = cache2;
  return cache2;
}
async function embedFonts(data, options) {
  let cssText = data.cssText;
  const regexUrl = /url\(["']?([^"')]+)["']?\)/g;
  const fontLocs = cssText.match(/url\([^)]+\)/g) || [];
  const loadFonts = fontLocs.map(async (loc) => {
    let url = loc.replace(regexUrl, "$1");
    if (!url.startsWith("https://")) {
      url = new URL(url, data.url).href;
    }
    return fetchAsDataURL(url, options.fetchRequestInit, ({ result }) => {
      cssText = cssText.replace(loc, `url(${result})`);
      return [loc, result];
    });
  });
  return Promise.all(loadFonts).then(() => cssText);
}
function parseCSS(source) {
  if (source == null) {
    return [];
  }
  const result = [];
  const commentsRegex = /(\/\*[\s\S]*?\*\/)/gi;
  let cssText = source.replace(commentsRegex, "");
  const keyframesRegex = new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})", "gi");
  while (true) {
    const matches = keyframesRegex.exec(cssText);
    if (matches === null) {
      break;
    }
    result.push(matches[0]);
  }
  cssText = cssText.replace(keyframesRegex, "");
  const importRegex = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi;
  const combinedCSSRegex = "((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})";
  const unifiedRegex = new RegExp(combinedCSSRegex, "gi");
  while (true) {
    let matches = importRegex.exec(cssText);
    if (matches === null) {
      matches = unifiedRegex.exec(cssText);
      if (matches === null) {
        break;
      } else {
        importRegex.lastIndex = unifiedRegex.lastIndex;
      }
    } else {
      unifiedRegex.lastIndex = importRegex.lastIndex;
    }
    result.push(matches[0]);
  }
  return result;
}
async function getCSSRules(styleSheets, options) {
  const ret = [];
  const deferreds = [];
  styleSheets.forEach((sheet) => {
    if ("cssRules" in sheet) {
      try {
        toArray(sheet.cssRules || []).forEach((item, index) => {
          if (item.type === CSSRule.IMPORT_RULE) {
            let importIndex = index + 1;
            const url = item.href;
            const deferred = fetchCSS(url).then((metadata) => embedFonts(metadata, options)).then((cssText) => parseCSS(cssText).forEach((rule) => {
              try {
                sheet.insertRule(rule, rule.startsWith("@import") ? importIndex += 1 : sheet.cssRules.length);
              } catch (error) {
                console.error("Error inserting rule from remote css", {
                  rule,
                  error
                });
              }
            })).catch((e) => {
              console.error("Error loading remote css", e.toString());
            });
            deferreds.push(deferred);
          }
        });
      } catch (e) {
        const inline = styleSheets.find((a) => a.href == null) || document.styleSheets[0];
        if (sheet.href != null) {
          deferreds.push(fetchCSS(sheet.href).then((metadata) => embedFonts(metadata, options)).then((cssText) => parseCSS(cssText).forEach((rule) => {
            inline.insertRule(rule, inline.cssRules.length);
          })).catch((err) => {
            console.error("Error loading remote stylesheet", err);
          }));
        }
        console.error("Error inlining remote css file", e);
      }
    }
  });
  return Promise.all(deferreds).then(() => {
    styleSheets.forEach((sheet) => {
      if ("cssRules" in sheet) {
        try {
          toArray(sheet.cssRules || []).forEach((item) => {
            ret.push(item);
          });
        } catch (e) {
          console.error(`Error while reading CSS rules from ${sheet.href}`, e);
        }
      }
    });
    return ret;
  });
}
function getWebFontRules(cssRules) {
  return cssRules.filter((rule) => rule.type === CSSRule.FONT_FACE_RULE).filter((rule) => shouldEmbed(rule.style.getPropertyValue("src")));
}
async function parseWebFontRules(node, options) {
  if (node.ownerDocument == null) {
    throw new Error("Provided element is not within a Document");
  }
  const styleSheets = toArray(node.ownerDocument.styleSheets);
  const cssRules = await getCSSRules(styleSheets, options);
  return getWebFontRules(cssRules);
}
function normalizeFontFamily(font) {
  return font.trim().replace(/["']/g, "");
}
function getUsedFonts(node) {
  const fonts = /* @__PURE__ */ new Set();
  function traverse(node2) {
    const fontFamily = node2.style.fontFamily || getComputedStyle(node2).fontFamily;
    fontFamily.split(",").forEach((font) => {
      fonts.add(normalizeFontFamily(font));
    });
    Array.from(node2.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        traverse(child);
      }
    });
  }
  traverse(node);
  return fonts;
}
async function getWebFontCSS(node, options) {
  const rules = await parseWebFontRules(node, options);
  const usedFonts = getUsedFonts(node);
  const cssTexts = await Promise.all(rules.filter((rule) => usedFonts.has(normalizeFontFamily(rule.style.fontFamily))).map((rule) => {
    const baseUrl = rule.parentStyleSheet ? rule.parentStyleSheet.href : null;
    return embedResources(rule.cssText, baseUrl, options);
  }));
  return cssTexts.join("\n");
}
async function embedWebFonts(clonedNode, options) {
  const cssText = options.fontEmbedCSS != null ? options.fontEmbedCSS : options.skipFonts ? null : await getWebFontCSS(clonedNode, options);
  if (cssText) {
    const styleNode = document.createElement("style");
    const sytleContent = document.createTextNode(cssText);
    styleNode.appendChild(sytleContent);
    if (clonedNode.firstChild) {
      clonedNode.insertBefore(styleNode, clonedNode.firstChild);
    } else {
      clonedNode.appendChild(styleNode);
    }
  }
}

// node_modules/html-to-image/es/index.js
async function toSvg(node, options = {}) {
  const { width, height } = getImageSize(node, options);
  const clonedNode = await cloneNode(node, options, true);
  await embedWebFonts(clonedNode, options);
  await embedImages(clonedNode, options);
  applyStyle(clonedNode, options);
  const datauri = await nodeToDataURL(clonedNode, width, height);
  return datauri;
}
async function toCanvas(node, options = {}) {
  const { width, height } = getImageSize(node, options);
  const svg = await toSvg(node, options);
  const img = await createImage(svg);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const ratio = options.pixelRatio || getPixelRatio();
  const canvasWidth = options.canvasWidth || width;
  const canvasHeight = options.canvasHeight || height;
  canvas.width = canvasWidth * ratio;
  canvas.height = canvasHeight * ratio;
  if (!options.skipAutoScale) {
    checkCanvasDimensions(canvas);
  }
  canvas.style.width = `${canvasWidth}`;
  canvas.style.height = `${canvasHeight}`;
  if (options.backgroundColor) {
    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function toPng(node, options = {}) {
  const canvas = await toCanvas(node, options);
  return canvas.toDataURL();
}

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
var EXPORT_PADDING_PX = 24;
var elements = Object.fromEntries(
  [
    "domain-label",
    "result-capture",
    "run-button",
    "share-button",
    "status-text",
    "status-panel",
    "status-icon",
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
elements.shareButton.addEventListener("click", shareResult);
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
      elements.shareButton.hidden = true;
    }
  };
  test.onResultsChange = ({ type }) => {
    setStage(stageFor(type), statusFor(type));
    renderResults(test.results);
  };
  test.onError = (error) => {
    stopProgressAnimation();
    elements.statusPanel.classList.remove("is-complete");
    updateProgress("Test failed. Please retry.", state.progress);
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Retest";
    elements.shareButton.hidden = true;
    console.error(error);
  };
  test.onFinish = (results) => {
    stopProgressAnimation();
    renderResults(results);
    finishProgress();
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
  elements.statusPanel.classList.remove("is-complete");
  elements.shareButton.hidden = true;
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
function finishProgress() {
  setStage("finishing", "Finishing");
  animateToProgress(99, 900, () => {
    updateProgress("Complete", 100);
    elements.statusPanel.classList.add("is-complete");
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Retest";
    elements.shareButton.hidden = false;
  });
}
async function shareResult() {
  const originalText = elements.shareButton.textContent;
  elements.shareButton.disabled = true;
  elements.shareButton.textContent = "Preparing";
  try {
    const rect = elements.resultCapture.getBoundingClientRect();
    const backgroundColor = getComputedStyle(document.body).backgroundColor;
    const dataUrl = await toPng(elements.resultCapture, {
      backgroundColor,
      cacheBust: true,
      filter: (node) => !node.classList?.contains("capture-exclude"),
      height: Math.ceil(rect.height) + EXPORT_PADDING_PX * 2,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      style: {
        backgroundColor,
        boxSizing: "content-box",
        padding: `${EXPORT_PADDING_PX}px`,
        width: `${Math.ceil(rect.width)}px`
      },
      width: Math.ceil(rect.width) + EXPORT_PADDING_PX * 2
    });
    const link = document.createElement("a");
    link.download = `speed-test-${safeFilePart(window.location.hostname)}.png`;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error(error);
    updateProgress("Could not export result.", state.progress);
  } finally {
    elements.shareButton.disabled = false;
    elements.shareButton.textContent = originalText;
  }
}
function animateToProgress(target, durationMs, onDone) {
  const start = state.progress;
  const startedAt = performance.now();
  const tick = () => {
    const elapsed = performance.now() - startedAt;
    const ratio = Math.min(1, elapsed / durationMs);
    const eased = 1 - (1 - ratio) ** 3;
    const next = start + (target - start) * eased;
    updateProgress(elements.statusText.textContent, Math.round(next));
    if (ratio < 1) {
      window.requestAnimationFrame(tick);
    } else {
      onDone?.();
    }
  };
  window.requestAnimationFrame(tick);
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
function safeFilePart(value) {
  return (value || "result").replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "");
}
