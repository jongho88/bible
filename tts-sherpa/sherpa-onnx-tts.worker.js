let tts = null;
self.Module = {
  // https://emscripten.org/docs/api_reference/module.html#Module.locateFile
  locateFile: function (path, scriptDirectory = "") {
    return scriptDirectory + path;
  },
  // https://emscripten.org/docs/api_reference/module.html#Module.locateFile
  setStatus: function (status) {
    self.postMessage({ type: "sherpa-onnx-tts-progress", status });
  },
  onRuntimeInitialized: function () {
    console.log("Model files downloaded!");
    console.log("Initializing tts ......");
    try {
      tts = createOfflineTts(self.Module);
      self.postMessage({
        type: "sherpa-onnx-tts-ready",
        modelType: getDefaultOfflineTtsModelType(),
        usePhonemize: getDefaultUsePhonemize(),
        numSpeakers: tts.numSpeakers,
        lang: tts.lang,
      });
    } catch (e) {
      self.postMessage({
        type: "error",
        message: "TTS Initialization failed: " + e.message,
      });
    }
  },
};

async function sbLoadParts(){
  const names=['sherpa-onnx-wasm-main-tts.data.part0','sherpa-onnx-wasm-main-tts.data.part1'];
  let cache=null; try{cache=await caches.open('stepbible-sherpa-v1');}catch(e){}
  const bufs=[];
  for(let i=0;i<names.length;i++){
    self.postMessage({type:'sherpa-onnx-tts-progress',status:'모델 받는 중 ('+(i+1)+'/'+names.length+') …'});
    let r=cache?await cache.match(names[i]):null;
    if(!r){ r=await fetch(names[i]); if(!r.ok) throw new Error('download failed '+names[i]); if(cache){ try{await cache.put(names[i], r.clone());}catch(e){} } }
    bufs.push(new Uint8Array(await r.arrayBuffer()));
  }
  let n=0; for(const b of bufs) n+=b.length;
  const all=new Uint8Array(n); let o=0; for(const b of bufs){all.set(b,o);o+=b.length;}
  return all.buffer;
}
sbLoadParts().then(function(buf){
  self.Module.getPreloadedPackage=function(){ return buf; };
  importScripts("sherpa-onnx-wasm-main-tts.js");
  importScripts("sherpa-onnx-tts.js");
}).catch(function(e){ self.postMessage({type:'error',message:'모델 다운로드 실패: '+e.message}); });


function getErrorMessage(err) {
  if (err instanceof Error) {
    if (err.stack) {
      return `${err.message}\n${err.stack}`;
    }
    return err.message;
  }

  return `${err}`;
}

self.onmessage = async (e) => {
  const { type, text, sid, speed, genConfig } = e.data;
  if (type == "generate") {
    if (!tts) {
      return;
    }
    try {
      const audio = tts.generate({
        text: text,
        sid: sid || 0,
        speed: speed || 1.0,
      });
      const samples = audio.samples;
      const sampleRate = tts.sampleRate;
      self.postMessage(
        {
          type: "sherpa-onnx-tts-result",
          samples: samples,
          sampleRate: sampleRate,
        },
        [samples.buffer],
      );
    } catch (err) {
      self.postMessage({
        type: "error",
        message: "Generation failed: " + getErrorMessage(err),
      });
    }
  } else if (type == "setFrontend") {
    if (!self.Module) {
      return;
    }
    setUsePhonemize(!!e.data.usePhonemize);
    if (tts && tts.free) {
      tts.free();
    }
    try {
      tts = createOfflineTts(self.Module);
      self.postMessage({
        type: "sherpa-onnx-tts-ready",
        modelType: getDefaultOfflineTtsModelType(),
        usePhonemize: getDefaultUsePhonemize(),
        numSpeakers: tts.numSpeakers,
        lang: tts.lang,
      });
    } catch (err) {
      self.postMessage({
        type: "error",
        message: "TTS Initialization failed: " + getErrorMessage(err),
      });
    }
  } else if (type == "generateWithConfig") {
    if (!tts) {
      return;
    }
    try {
      const config = Object.assign({}, genConfig || {});
      config.callback = (samples, n, progress) => {
        self.postMessage({
          type: "sherpa-onnx-tts-generation-progress",
          progress: progress,
        });
        return 1;
      };

      const audio = tts.generateWithConfig(text, config);
      const samples = audio.samples;
      const sampleRate = audio.sampleRate;
      self.postMessage(
          {
            type: "sherpa-onnx-tts-result",
            samples: samples,
            sampleRate: sampleRate,
          },
          [samples.buffer],
      );
    } catch (err) {
      self.postMessage({
        type: "error",
        message: "Generation failed: " + getErrorMessage(err),
      });
    }
  }
};
