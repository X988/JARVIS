import { o as __toESM } from "../_runtime.mjs";
import { S as require_jsx_runtime, Y as require_react, b as Navigate, y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as canApprove } from "./actors-DFw_72c8.mjs";
import { a as ScrollText, c as Mic, d as KeyRound, f as ArrowUp, i as Server, l as MicOff, o as Phone, r as Square, s as PhoneOff, t as X, u as MessageSquare } from "../_libs/lucide-react.mjs";
import { C as matchIntent, S as formatLeft, T as ONEC_DEV, _ as SERVICES, a as downsampleAverage, c as stepListen, d as ACCOUNTS, f as ONEC_READER, g as SERVERS, h as RUNBOOKS, i as concatFloats, k as hasGateSessionMarker, m as RISK_LABEL, n as LISTEN_INITIAL, o as encodeWavPcm16, p as OPERATORS, s as rmsOf, u as bargeIn, v as SUGGESTIONS, w as normalize, x as formatClock, y as VOICE_PRESETS } from "./router-ANjjZ9ur.mjs";
import { a as postVoiceHear, c as useJarvis, i as listToolAudit, n as WATCH_HOSTS, o as postVoiceSpeak, r as getToolStatus, s as postVoiceTurn, t as WATCH_ALERTS } from "./store-DT6KVtOz.mjs";
import "./client-BuTbb0jQ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CBF-RKVr.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var WORKLET = `
class JarvisCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("jarvis-capture", JarvisCapture);
`;
function micError(error) {
	if (!window.isSecureContext) return "Микрофон доступен только по HTTPS.";
	const name = error instanceof DOMException ? error.name : "";
	if (name === "NotAllowedError" || name === "SecurityError") return "Нет доступа к микрофону. Разрешите запись в браузере и повторите.";
	if (name === "NotFoundError") return "Микрофон не найден.";
	if (name === "NotReadableError") return "Микрофон занят другим приложением.";
	return "Не удалось открыть микрофон.";
}
async function beginVoiceCall() {
	if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return {
		stream: null,
		context: null,
		error: "Этот браузер не даёт доступ к микрофону.",
		released: false
	};
	if (!window.isSecureContext) return {
		stream: null,
		context: null,
		error: "Микрофон доступен только по HTTPS.",
		released: false
	};
	let context = null;
	try {
		try {
			context = new AudioContext({ sampleRate: 16e3 });
		} catch {
			context = new AudioContext();
		}
		const resumed = context.resume();
		let stream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
				channelCount: 1
			} });
		} catch (error) {
			if (error instanceof DOMException && error.name === "OverconstrainedError") stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			else throw error;
		}
		await resumed;
		return {
			stream,
			context,
			error: null,
			released: false
		};
	} catch (error) {
		context?.close().catch(() => void 0);
		return {
			stream: null,
			context: null,
			error: micError(error),
			released: false
		};
	}
}
function releaseVoiceCall(handle) {
	if (!handle || handle.released) return;
	handle.released = true;
	handle.stream?.getTracks().forEach((track) => track.stop());
	handle.context?.close().catch(() => void 0);
}
function failText(code) {
	if (code === "AUTH_REQUIRED") return "Нужна сессия. Войдите и повторите.";
	if (code === "ACTOR_DENIED") return "Эта учётка не оператор. Ничего не запускал.";
	if (code === "RATE_LIMIT") return "Слишком много фраз подряд. Подождите минуту.";
	if (code === "NOT_CONFIGURED") return "Распознавание на сервере не настроено.";
	if (code === "STT_FAILED") return "Не удалось распознать речь. Ничего не запускал.";
	return "Не удалось получить ответ.";
}
function isAbort(error) {
	return error instanceof DOMException && error.name === "AbortError";
}
function VoiceCall({ handle, approval, onClose }) {
	const showVoiceResult = useJarvis((state) => state.showVoiceResult);
	const [phase, setPhase] = (0, import_react.useState)("listening");
	const [muted, setMuted] = (0, import_react.useState)(false);
	const [transcript, setTranscript] = (0, import_react.useState)("");
	const [reply, setReply] = (0, import_react.useState)("");
	const [note, setNote] = (0, import_react.useState)(handle.error);
	const [elapsed, setElapsed] = (0, import_react.useState)(0);
	const [sentence, setSentence] = (0, import_react.useState)(0);
	const [sentenceCount, setSentenceCount] = (0, import_react.useState)(0);
	const [levels, setLevels] = (0, import_react.useState)(() => Array.from({ length: 12 }, () => .15));
	const startedRef = (0, import_react.useRef)(0);
	const dialogRef = (0, import_react.useRef)(null);
	const controls = (0, import_react.useRef)({
		interrupt: () => void 0,
		mute: () => void 0
	});
	const approvalRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		dialogRef.current?.focus();
	}, []);
	(0, import_react.useEffect)(() => {
		const onKey = (event) => {
			if (event.key === "Escape" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);
	(0, import_react.useEffect)(() => {
		if (approval) approvalRef.current?.scrollIntoView({ block: "nearest" });
	}, [approval]);
	(0, import_react.useEffect)(() => {
		if (phase !== "thinking") return;
		const id = window.setInterval(() => {
			setElapsed(Math.max(0, Math.round((Date.now() - startedRef.current) / 1e3)));
		}, 250);
		return () => window.clearInterval(id);
	}, [phase]);
	(0, import_react.useEffect)(() => {
		if (!handle.stream || !handle.context || handle.error) return;
		const context = handle.context;
		const stream = handle.stream;
		let stopped = false;
		let alive = true;
		let gen = 0;
		let listen = LISTEN_INITIAL;
		let phaseNow = "listening";
		let uttered = [];
		let preroll = [];
		let prerollSamples = 0;
		let pending = /* @__PURE__ */ new Float32Array(0);
		let hot = [];
		let bargeFrames = [];
		let frameTick = 0;
		const mutedRef = { current: false };
		const hearAbort = { current: null };
		const speakAbort = { current: null };
		let sourceNode = null;
		const prerollMax = Math.round(3840);
		const nativeFrame = Math.max(1, Math.round(context.sampleRate * .03));
		let wake = null;
		navigator.wakeLock?.request("screen").then((lock) => {
			wake = lock;
		}).catch(() => void 0);
		function stopPlayback() {
			speakAbort.current?.abort();
			speakAbort.current = null;
			const node = sourceNode;
			sourceNode = null;
			if (!node) return;
			try {
				node.stop();
			} catch {}
		}
		function bump() {
			gen += 1;
			hearAbort.current?.abort();
			hearAbort.current = null;
			stopPlayback();
		}
		async function play(buffer, ticket) {
			if (!alive || ticket !== gen) return;
			const audio = await context.decodeAudioData(buffer.slice(0));
			if (!alive || ticket !== gen) return;
			await new Promise((resolve) => {
				const node = context.createBufferSource();
				sourceNode = node;
				node.buffer = audio;
				node.connect(context.destination);
				node.onended = () => {
					if (sourceNode === node) sourceNode = null;
					resolve();
				};
				node.start();
			});
		}
		async function consume(samples, ticket) {
			if (samples.length < Math.round(3200)) {
				if (ticket === gen) {
					phaseNow = "listening";
					if (alive) setPhase("listening");
				}
				return;
			}
			phaseNow = "thinking";
			startedRef.current = Date.now();
			if (alive) {
				setElapsed(0);
				setPhase("thinking");
				setNote(null);
				setSentence(0);
			}
			const hearCtrl = new AbortController();
			hearAbort.current = hearCtrl;
			try {
				const wav = encodeWavPcm16(samples, 16e3);
				const pcm = new ArrayBuffer(wav.byteLength);
				new Uint8Array(pcm).set(wav);
				const heard = await postVoiceHear(new Blob([pcm], { type: "audio/wav" }), hearCtrl.signal);
				if (!alive || ticket !== gen) return;
				if (heard.code !== "OK" || !heard.text) {
					setTranscript(heard.text || heard.raw || "");
					setNote(heard.message || failText(heard.code));
					phaseNow = "listening";
					setPhase("listening");
					return;
				}
				setTranscript(heard.text);
				const turn = await postVoiceTurn(heard.text, `voice-${crypto.randomUUID()}`);
				if (!alive) return;
				showVoiceResult(turn, heard.raw && heard.raw !== heard.text ? heard.raw : void 0);
				if (ticket !== gen) return;
				if (!turn.spoken) {
					setNote(failText(turn.code));
					phaseNow = "listening";
					setPhase("listening");
					return;
				}
				setReply(turn.spoken);
				if (!turn.tts || turn.sentences.length === 0) {
					setNote(turn.tts ? null : "Озвучка не настроена. Ответ показан текстом.");
					phaseNow = "listening";
					setPhase("listening");
					return;
				}
				phaseNow = "speaking";
				setPhase("speaking");
				setSentenceCount(turn.sentences.length);
				const speakCtrl = new AbortController();
				speakAbort.current = speakCtrl;
				let upcoming = postVoiceSpeak(turn.sentences[0], speakCtrl.signal);
				for (let index = 0; index < turn.sentences.length; index += 1) {
					if (!alive || ticket !== gen) return;
					const audio = await upcoming;
					if (!alive || ticket !== gen) return;
					if (!audio.ok) {
						setNote(audio.code === "NOT_CONFIGURED" ? "Озвучка не настроена. Ответ показан текстом." : "Не удалось озвучить ответ.");
						phaseNow = "listening";
						setPhase("listening");
						return;
					}
					upcoming = index + 1 < turn.sentences.length ? postVoiceSpeak(turn.sentences[index + 1], speakCtrl.signal) : Promise.resolve({
						ok: false,
						code: "DONE"
					});
					setSentence(index + 1);
					await play(audio.audio, ticket);
				}
				if (alive && ticket === gen) {
					phaseNow = "listening";
					setPhase("listening");
				}
			} catch (error) {
				if (!alive || ticket !== gen || isAbort(error)) return;
				setNote("Не удалось обработать фразу. Ничего не запускал.");
				phaseNow = "listening";
				setPhase("listening");
			}
		}
		function onFrame(down, rms) {
			if (stopped || mutedRef.current) return;
			frameTick += 1;
			if (alive && frameTick % 3 === 0) setLevels((current) => current.slice(1).concat(Math.max(.08, Math.min(1, rms * 8))));
			if (phaseNow !== "listening") {
				if (rms >= .02) {
					hot.push(down);
					if (hot.length > 16) hot.shift();
				}
				bargeFrames.push({ rms });
				if (bargeFrames.length > 24) bargeFrames.shift();
				if (bargeIn(bargeFrames, phaseNow === "speaking" ? .035 : .02)) {
					const seed = hot.map((chunk) => chunk.slice());
					hot = [];
					bargeFrames = [];
					bump();
					uttered = seed;
					preroll = [];
					prerollSamples = 0;
					listen = {
						phase: "speech",
						speechMs: 200,
						silenceMs: 0,
						utteranceMs: 200
					};
					phaseNow = "listening";
					if (alive) setPhase("listening");
				}
				return;
			}
			preroll.push(down);
			prerollSamples += down.length;
			while (prerollSamples > prerollMax && preroll.length > 1) {
				prerollSamples -= preroll[0].length;
				preroll.shift();
			}
			const stepped = stepListen(listen, rms, 30);
			listen = stepped.state;
			if (stepped.event === "start") {
				uttered = preroll.map((chunk) => chunk.slice());
				return;
			}
			if (listen.phase === "speech" && stepped.event === "none") {
				uttered.push(down);
				return;
			}
			if (stepped.event === "endpoint" || stepped.event === "max") {
				uttered.push(down);
				const pcm = concatFloats(uttered);
				uttered = [];
				preroll = [];
				prerollSamples = 0;
				listen = LISTEN_INITIAL;
				const ticket = gen;
				phaseNow = "thinking";
				consume(pcm, ticket);
			}
		}
		function pushNative(chunk) {
			if (stopped) return;
			const next = new Float32Array(pending.length + chunk.length);
			next.set(pending, 0);
			next.set(chunk, pending.length);
			pending = next;
			while (pending.length >= nativeFrame) {
				const frame = pending.slice(0, nativeFrame);
				pending = pending.slice(nativeFrame);
				onFrame(context.sampleRate === 16e3 ? frame : downsampleAverage(frame, context.sampleRate, 16e3), rmsOf(frame));
			}
		}
		controls.current.interrupt = () => {
			bump();
			uttered = [];
			hot = [];
			bargeFrames = [];
			preroll = [];
			prerollSamples = 0;
			listen = LISTEN_INITIAL;
			phaseNow = "listening";
			if (alive) setPhase("listening");
		};
		controls.current.mute = () => {
			mutedRef.current = !mutedRef.current;
			stream.getAudioTracks().forEach((track) => {
				track.enabled = !mutedRef.current;
			});
			if (mutedRef.current) {
				uttered = [];
				listen = LISTEN_INITIAL;
				bargeFrames = [];
				hot = [];
			}
			if (alive) setMuted(mutedRef.current);
		};
		const source = context.createMediaStreamSource(stream);
		const sink = context.createGain();
		sink.gain.value = 0;
		let processor = null;
		let worklet = null;
		let closed = false;
		const attachProcessor = () => {
			processor = context.createScriptProcessor(4096, 1, 1);
			processor.onaudioprocess = (event) => {
				pushNative(event.inputBuffer.getChannelData(0).slice());
			};
			source.connect(processor);
			processor.connect(sink);
			sink.connect(context.destination);
		};
		const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
		context.audioWorklet.addModule(url).then(() => {
			URL.revokeObjectURL(url);
			if (stopped || closed) return;
			worklet = new AudioWorkletNode(context, "jarvis-capture");
			worklet.port.onmessage = (event) => {
				if (event.data) pushNative(event.data);
			};
			source.connect(worklet);
			worklet.connect(sink);
			sink.connect(context.destination);
		}).catch(() => {
			URL.revokeObjectURL(url);
			if (!stopped && !closed) attachProcessor();
		});
		return () => {
			stopped = true;
			alive = false;
			closed = true;
			bump();
			try {
				processor?.disconnect();
				worklet?.disconnect();
				source.disconnect();
				sink.disconnect();
			} catch {}
			wake?.release().catch(() => void 0);
		};
	}, [handle, showVoiceResult]);
	const label = handle.error ? "Микрофон недоступен" : muted && phase === "listening" ? "Микрофон выключен" : phase === "listening" ? "Слушаю" : phase === "thinking" ? "Думаю" : "Говорю";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-30 flex flex-col bg-bg text-fg",
		role: "presentation",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			ref: dialogRef,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "voice-call-title",
			tabIndex: -1,
			className: "call-pad flex min-h-0 flex-1 flex-col outline-none",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "flex items-start justify-between gap-3 px-4 pt-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-mono text-xs text-moss",
						children: "РАЗГОВОР"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						id: "voice-call-title",
						className: "text-xl font-semibold tracking-tight",
						children: "JARVIS"
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: onClose,
						className: "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PhoneOff, {
							className: "size-4",
							"aria-hidden": "true"
						}), "Выйти"]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col items-center gap-4 py-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "call-orb flex size-28 items-center justify-center rounded-full border-2 " + (phase === "thinking" ? "border-warn" : phase === "speaking" ? "border-paper" : "border-moss"),
									"data-state": muted && phase === "listening" ? "muted" : phase,
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "flex h-8 items-end gap-1",
										"aria-hidden": "true",
										children: levels.map((level, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "w-1 rounded-sm " + (phase === "thinking" ? "bg-warn" : "bg-moss"),
											style: { height: `${Math.max(4, Math.round(level * 32))}px` }
										}, index))
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "text-center",
									"aria-live": "polite",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-3xl font-semibold tracking-tight",
											children: label
										}),
										phase === "thinking" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-2 text-sm text-muted tabular-nums",
											children: [
												"Модель отвечает · ",
												elapsed,
												" с"
											]
										}) : null,
										phase === "speaking" && sentenceCount > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-2 font-mono text-xs text-subtle tabular-nums",
											children: [
												"фраза ",
												sentence,
												" из ",
												sentenceCount
											]
										}) : null
									]
								}),
								phase === "thinking" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "h-1 w-full max-w-sm overflow-hidden rounded-full bg-elevated",
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "call-progress h-full w-1/3 rounded-full bg-warn" })
								}) : null
							]
						}),
						transcript ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
							className: "rounded-xl border border-line bg-surface p-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono text-xs text-subtle",
								children: "Вы сказали"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 text-pretty text-sm",
								children: transcript
							})]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-pretty text-center text-sm text-muted",
							children: "Говорите спокойно. После паузы я распознаю фразу, отвечу и снова буду слушать."
						}),
						reply ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
							className: "rounded-xl border border-line bg-elevated p-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono text-xs text-moss",
								children: "JARVIS"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 text-pretty text-sm",
								children: reply
							})]
						}) : null,
						note ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-pretty text-sm text-warn",
							children: note
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-pretty text-sm text-subtle",
							children: "Голос ничего не подтверждает и не выполняет. Опасная команда останется заявкой: фразу CONFIRM нужно ввести текстом."
						}),
						approval ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							ref: approvalRef,
							children: approval
						}) : null
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", {
					className: "flex flex-wrap gap-2 border-t border-line px-4 py-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => controls.current.interrupt(),
						className: "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-paper px-3 text-sm font-medium text-ink",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, {
							className: "size-4",
							"aria-hidden": "true"
						}), "Прервать"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						"aria-pressed": muted,
						onClick: () => controls.current.mute(),
						className: "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm",
						children: [muted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mic, {
							className: "size-4",
							"aria-hidden": "true"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicOff, {
							className: "size-4",
							"aria-hidden": "true"
						}), muted ? "Включить микрофон" : "Выключить микрофон"]
					})]
				})
			]
		})
	});
}
var REPAIRS = [
	[/^(жарвис|чарвис|зарвис|дарвис|гарвис|джарвис)[, ]+/, ""],
	[/мейл\s*кау|мейл\s*ков|мейл\s*коу|мэйл\s*ков|майл\s*ков|майлков|мелков|мылков|мылкоу|мейлкоу|мейлкау|mail\s*cow/g, "mailcow"],
	[/вайр\s*гард\S*|вайер\s*гард\S*|ваергард\S*|wire\s*guard/g, "wireguard"],
	[/майкро\s*тик|микро\s*тик/g, "mikrotik"],
	[/гит\s*хаб|git\s*hub/g, "github"],
	[/экшенс|экшнс|экшены/g, "actions"],
	[/ютэпэ|ю\s*т\s*п|у\s*т\s*п|утипи|ютип/g, "utp"],
	[/(^|\s)один эс(\s|$)/g, "$11с$2"],
	[/(^|\s)один с(\s|$)/g, "$11с$2"],
	[/проверь почт\S*/g, "проверь mailcow"],
	[/(^|\s)сервак\S*/g, "$1сервер"],
	[/проверь север/g, "проверь сервер"],
	[/чекни/g, "проверь"],
	[/бекап/g, "бэкап"],
	[/(^|\s)ди\s*си(\s|$)/g, "$1контроллер домена$2"],
	[/(^|\s)дц(\s|$)/g, "$1контроллер домена$2"],
	[/(^|\s)конфу(\s|$)/g, "$1конфигурация$2"],
	[/(^|\s)конфа(\s|$)/g, "$1конфигурация$2"]
];
var SAFE = [
	{
		say: "Проверь Mailcow",
		keys: ["mailcow", "почт"]
	},
	{
		say: "Сделай резервную копию базы utp",
		keys: [
			"utp",
			"бэкап",
			"копи"
		]
	},
	{
		say: "Проверь базу utp",
		keys: ["базу utp", "базу"]
	},
	{
		say: "Проверь сервер",
		keys: ["сервер", "площад"]
	},
	{
		say: "Проверь сервер 1С",
		keys: ["1с"]
	},
	{
		say: "Проверь свободное место на всех серверах",
		keys: ["место", "диск"]
	},
	{
		say: "Посмотри WireGuard",
		keys: ["wireguard"]
	},
	{
		say: "Проверь MikroTik",
		keys: ["mikrotik", "маршрутизатор"]
	},
	{
		say: "Почему не работает резервный интернет",
		keys: ["интернет", "канал"]
	},
	{
		say: "Почему пользователи не заходят в 1С",
		keys: ["не заходят", "не пускает"]
	},
	{
		say: "Почему GitHub Actions упал",
		keys: ["github", "actions"]
	},
	{
		say: "Проверь Docker",
		keys: ["docker", "докер"]
	},
	{
		say: "Сделай отчёт за сегодня",
		keys: ["отчет", "сводк"]
	},
	{
		say: "Почисти сервер",
		keys: ["почисти", "очисти"]
	},
	{
		say: "Проверь контроллер домена",
		keys: ["контроллер"]
	},
	{
		say: "Посмотри модуль проведения в расширении",
		keys: ["модул", "расширен"]
	},
	{
		say: "Проверь запрос к регистру накопления",
		keys: ["проверь запрос", "запрос к регистр"]
	}
];
function repairSpeech(raw) {
	let text = normalize(raw);
	for (const [pattern, next] of REPAIRS) text = text.replace(pattern, next);
	return text.replace(/\s+/g, " ").trim();
}
function alternativesFrom(results) {
	const chunks = [];
	for (let i = 0; i < results.length; i += 1) chunks.push(results[i]);
	if (!chunks.length) return [];
	const finals = chunks.filter((item) => item.isFinal);
	const tail = chunks[chunks.length - 1];
	const headText = (tail && !tail.isFinal ? finals : finals.slice(0, -1)).map((item) => item[0]?.transcript ?? "").join(" ").trim();
	const varied = tail && !tail.isFinal ? tail : finals[finals.length - 1];
	const count = varied?.length ?? 1;
	const alts = [];
	for (let index = 0; index < count; index += 1) {
		const transcript = `${headText} ${varied?.[index]?.transcript?.trim() ?? ""}`.trim();
		if (!transcript) continue;
		alts.push({
			transcript,
			confidence: varied?.[index]?.confidence ?? 0
		});
	}
	if (!alts.length && headText) alts.push({
		transcript: headText,
		confidence: 1
	});
	return alts;
}
function hasSeveralSteps(text) {
	return /(?:,| и | потом | затем | а также | после этого )/.test(text);
}
function grams(input) {
	const map = /* @__PURE__ */ new Map();
	const text = ` ${input} `;
	for (let i = 0; i < text.length - 1; i += 1) {
		const gram = text.slice(i, i + 2);
		map.set(gram, (map.get(gram) ?? 0) + 1);
	}
	return map;
}
function dice(leftText, rightText) {
	if (!leftText || !rightText) return 0;
	if (leftText === rightText) return 1;
	const left = grams(leftText);
	const right = grams(rightText);
	let overlap = 0;
	let leftCount = 0;
	let rightCount = 0;
	for (const value of left.values()) leftCount += value;
	for (const value of right.values()) rightCount += value;
	for (const [gram, value] of left) overlap += Math.min(value, right.get(gram) ?? 0);
	return 2 * overlap / (leftCount + rightCount);
}
function fuzzyScore(heard, item) {
	const say = normalize(item.say);
	const keyHit = item.keys.some((key) => heard.includes(normalize(key)));
	const similarity = dice(heard, say);
	if (!keyHit) return similarity < .86 ? similarity * .45 : similarity;
	return Math.max(similarity, .7);
}
function interpretSpeech(alts) {
	const cleaned = alts.map((alt) => ({
		raw: alt.transcript.trim(),
		text: repairSpeech(alt.transcript),
		confidence: alt.confidence
	})).filter((alt) => alt.raw || alt.text);
	if (!cleaned.length) return {
		raw: "",
		text: "",
		changed: false,
		uncertain: false,
		choices: []
	};
	const best = cleaned.map((alt) => ({
		...alt,
		intent: matchIntent(alt.text)
	})).sort((a, b) => {
		const known = Number(b.intent !== "unknown") - Number(a.intent !== "unknown");
		if (known !== 0) return known;
		if (b.confidence !== a.confidence) return b.confidence - a.confidence;
		return b.text.length - a.text.length;
	})[0];
	if (best.intent !== "unknown" && !hasSeveralSteps(best.text)) {
		const canon = SAFE.filter((item) => matchIntent(item.say) === best.intent);
		const text = canon.length === 1 ? canon[0].say : best.text;
		return {
			raw: best.raw,
			text,
			changed: normalize(best.raw) !== normalize(text),
			uncertain: false,
			choices: []
		};
	}
	const basis = cleaned.slice().sort((a, b) => b.text.length - a.text.length)[0];
	if (hasSeveralSteps(basis.text)) return {
		raw: basis.raw,
		text: basis.text,
		changed: normalize(basis.raw) !== basis.text,
		uncertain: false,
		choices: []
	};
	const scored = SAFE.map((item) => ({
		...item,
		score: fuzzyScore(basis.text, item)
	})).sort((a, b) => b.score - a.score);
	const top = scored[0];
	const second = scored[1];
	const lead = top.score - (second?.score ?? 0);
	if (top.score >= .72 && lead >= .08) return {
		raw: basis.raw,
		text: top.say,
		changed: true,
		uncertain: false,
		choices: []
	};
	if (top.score >= .62 && second && second.score >= .55 && lead < .08) return {
		raw: basis.raw,
		text: basis.text,
		changed: false,
		uncertain: true,
		choices: [{
			label: top.say,
			text: top.say
		}, {
			label: second.say,
			text: second.say
		}]
	};
	return {
		raw: basis.raw,
		text: basis.text || basis.raw,
		changed: normalize(basis.raw) !== (basis.text || basis.raw),
		uncertain: false,
		choices: []
	};
}
var RESULT_LABEL = {
	dry_run: "DRY RUN · не отправлялось",
	executed: "Выполнено",
	awaiting_approval: "Ждёт решения",
	approved_dry_run: "Approve · dry-run, не отправлялось",
	rejected: "Reject",
	denied: "Отказ политики",
	forbidden: "Нет права",
	error: "Ошибка"
};
function tone(result) {
	if (result === "denied" || result === "error" || result === "forbidden") return "text-danger";
	if (result === "awaiting_approval" || result === "rejected") return "text-warn";
	return "text-moss";
}
function ToolRunCard({ calls, assistant, mode, canApprove, onDecide }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-4 flex flex-col gap-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "font-mono text-xs text-subtle",
				children: [
					"инструменты · ",
					mode,
					mode === "dry-run" ? " · хосты не вызываются" : ""
				]
			}),
			calls.map((call) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-lg border border-line bg-bg p-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center justify-between gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "font-mono text-xs text-paper",
							children: [
								call.tool,
								" · ",
								call.risk === "change" ? "change" : "read-only",
								" · ",
								call.host
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: `font-mono text-xs ${tone(call.result)}`,
							children: RESULT_LABEL[call.result]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 font-mono text-sm break-all text-paper",
						"data-tool-command": true,
						children: call.command
					}),
					call.detail ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-pretty text-sm text-muted",
						children: call.detail
					}) : null,
					call.result === "awaiting_approval" && call.approvalId ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 flex flex-col gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm",
								children: "Точная команда выше. Изменение уходит только после Approve."
							}),
							canApprove ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-warn",
								children: "Только operator или admin могут нажать Approve или Reject."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap gap-2",
								"data-approval-actions": true,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: !canApprove,
									onClick: () => onDecide(call.approvalId ?? "", "approve"),
									className: "min-h-11 rounded-md bg-paper px-3 text-sm font-medium text-ink disabled:opacity-40",
									children: "Approve"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: !canApprove,
									onClick: () => onDecide(call.approvalId ?? "", "reject"),
									className: "min-h-11 rounded-md border border-line px-3 text-sm text-danger disabled:opacity-40",
									children: "Reject"
								})]
							})
						]
					}) : null
				]
			}, call.id)),
			assistant ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-pretty text-sm",
				children: assistant
			}) : null
		]
	});
}
/**
* Stable fallback user, used ONLY when auth is disabled
* (`VITE_AUTH_ENABLED=false`, the shipped default). With auth on, the sandbox
* live preview does real sign-in via the baked preview client. Its id is
* `"dev-user"` — the SAME id `verify.server.ts` returns server-side — so per-user
* rows written in that mode belong to one consistent owner.
*/
var DEV_USER = {
	id: "dev-user",
	displayName: "Dev User",
	primaryEmail: "dev@example.com",
	profileImageUrl: null,
	isDevFallback: true
};
/**
* Current user + loading state. Same behavior in live preview and when deployed:
*   - Auth enabled -> the real signed-in user; `user` is `null` while
*                            the session resolves (`isPending: true`) and when
*                            signed out (`isPending: false`). Session comes from
*                            Better Auth `useSession()` → `/api/auth/get-session`
*                            (cookie when deployed; bearer in live preview).
*   - Auth disabled (`VITE_AUTH_ENABLED=false`) -> `DEV_USER`, never pending.
*
* Protect a route by waiting out `isPending` before acting on `user` —
* redirecting on `user: null` alone bounces signed-in visitors to sign-in on
* every hard reload:
*
*   import { RedirectToSignIn } from "@/lib/auth/gates";
*   const { user, isPending } = useCurrentUserState();
*   if (isPending) return null;              // still resolving — don't redirect yet
*   if (!user) return <RedirectToSignIn />;  // definitely signed out
*
* `authEnabled` is a module-level constant fixed at load, so the guarded hook
* call keeps a stable hook order across every render of a given component.
*/
function useCurrentUserState() {
	return {
		user: DEV_USER,
		isPending: false
	};
}
/**
* Convenience view of `useCurrentUserState().user` for display (e.g.
* `user?.displayName ?? "Guest"`). NOTE: `null` means *loading OR signed out* —
* for redirects/guards use `useCurrentUserState()` and check `isPending`.
*/
function useCurrentUser() {
	return useCurrentUserState().user;
}
var subscribeToNothing = () => () => {};
var noGateSessionOnServer = () => false;
/**
* Auth state components — plain wrappers around `useCurrentUserState()`.
*
* With auth on, visitors are signed out until they authenticate — in the sandbox
* live preview too, which does real sign-in. The shared dev user appears only
* when auth is disabled (`VITE_AUTH_ENABLED=false`, the shipped default).
* While the session is still resolving, gates that care about signed-out state
* render nothing so there's no signed-out flash on hard reload.
*/
/** Where `RedirectToSignIn` sends signed-out visitors. Create this route. */
var SIGN_IN_PATH = "/login";
/**
* Client-side redirect to the sign-in route (TanStack `<Navigate>` — NOT a full
* `window.location` reload). A hard navigation re-bootstraps the SPA and re-runs
* session loading, which feels like a second "Loading…" on /login.
*
* Guard routes by waiting out `isPending` first (see `use-current-user`), then
* render this.
*/
function RedirectToSignIn({ to = SIGN_IN_PATH }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigate, { to });
}
/**
* Minimal signed-in identity chip + sign-out. Restyle freely (see the
* `design-ui` skill). Sign-out is only shown when auth is enabled (the
* disabled-auth dev user has nothing to sign out of) and the session is not
* gate-materialized — behind the gate the next request signs the viewer
* straight back in, so a sign-out control there is a broken loop.
*/
function UserButton() {
	const user = useCurrentUser();
	const [signingOut, setSigningOut] = (0, import_react.useState)(false);
	(0, import_react.useSyncExternalStore)(subscribeToNothing, hasGateSessionMarker, noGateSessionOnServer);
	if (!user) return null;
	const label = user.displayName ?? user.primaryEmail ?? "Account";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-2",
		children: [
			user.profileImageUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: user.profileImageUrl,
				alt: "",
				className: "h-8 w-8 rounded-full object-cover"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "grid h-8 w-8 place-items-center rounded-full bg-black/10 text-sm font-medium dark:bg-white/20",
				children: label.charAt(0).toUpperCase()
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-sm font-medium",
				children: label
			}),
			false
		]
	});
}
var STEP_TEXT = [
	"Приём",
	"Намерение",
	"Политика",
	"Решение"
];
var STEP_VOICE = [
	"Whisper",
	"Намерение",
	"Политика",
	"Решение"
];
function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
function createRecognizer() {
	if (typeof window === "undefined") return null;
	const host = window;
	const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
	if (!Ctor) return null;
	const rec = new Ctor();
	rec.lang = "ru-RU";
	rec.continuous = true;
	rec.interimResults = true;
	rec.maxAlternatives = 5;
	return rec;
}
function voiceNoteText(code) {
	if (code === "not-allowed" || code === "service-not-allowed") return "Нет доступа к микрофону. Разрешите запись и повторите.";
	if (code === "audio-capture") return "Микрофон не найден.";
	if (code === "network") return "Распознавание сейчас недоступно. Можно выбрать пример фразы.";
	if (code === "no-speech") return "Речь не разобрана. Скажите ещё раз или выберите пример.";
	if (code === "unsupported") return "Этот браузер не распознаёт речь. Ниже те же команды, как голосовое из Telegram.";
	return "Не удалось распознать. Повторите или выберите пример.";
}
function riskClass(risk) {
	if (risk === 0) return "bg-forest text-paper";
	if (risk === 3) return "bg-danger-deep text-paper";
	if (risk === 2) return "text-warn";
	return "text-fg";
}
function RiskBadge({ risk }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex min-h-6 items-center rounded-sm px-2 font-mono text-xs " + (risk === 0 || risk === 3 ? riskClass(risk) : `border border-line ${riskClass(risk)}`),
		children: [
			"L",
			risk,
			" · ",
			RISK_LABEL[risk]
		]
	});
}
function dotClass(state) {
	if (state === "ok") return "bg-moss";
	if (state === "warn") return "bg-warn";
	if (state === "bad") return "bg-danger";
	return "bg-subtle";
}
function stamp(turn) {
	if (turn.toolRun) {
		if (turn.phase === "awaiting") return "Ждёт Approve";
		if (turn.toolRun.calls.every((call) => call.result === "denied")) return "Отказ";
		if (turn.dryRun) return "DRY RUN · инструмент";
		return "Инструмент";
	}
	if (turn.phase === "running") return "Разбор";
	if (turn.phase === "awaiting") return "Ждёт фразу";
	if (turn.phase === "expired") return "Срок истёк";
	if (turn.phase === "cancelled") return "Отменено";
	if (turn.decision.verdict === "deny") return "Отказ";
	if (turn.decision.verdict === "clarify") return "Без действия";
	if (turn.dryRun && turn.decision.mutation) return "DRY RUN · не выполнялось";
	if (turn.dryRun) return "DRY RUN · чтение";
	if (turn.executed) return "Симуляция шаблона";
	return "Готово";
}
function phaseTone(phase, verdict) {
	if (phase === "denied" || verdict === "deny") return "text-danger";
	if (phase === "awaiting" || phase === "expired" || verdict === "clarify") return "text-warn";
	if (phase === "cancelled") return "text-subtle";
	return "text-moss";
}
function Wave({ levels }) {
	const bars = levels && levels.length > 0 ? levels : [
		.2,
		.2,
		.2,
		.2,
		.2,
		.2,
		.2,
		.2,
		.2,
		.2,
		.2,
		.2
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex h-8 items-end gap-1",
		"aria-hidden": "true",
		children: bars.slice(0, 12).map((level, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "w-1 rounded-sm bg-moss",
			style: { height: `${Math.max(4, Math.round(level * 32))}px` }
		}, index))
	});
}
function Findings({ items }) {
	if (items.length === 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "mt-4 flex flex-col gap-3",
		children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
			className: "flex gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `mt-1.5 size-2 shrink-0 rounded-full ${dotClass(item.state)}` }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm font-medium",
					children: item.label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-pretty text-sm text-muted",
					children: item.detail
				})]
			})]
		}, item.label))
	});
}
function ApprovalBox({ turn, now }) {
	const [value, setValue] = (0, import_react.useState)("");
	const reply = useJarvis((state) => state.reply);
	const cancel = useJarvis((state) => state.cancel);
	const approval = turn.approval;
	if (!approval || turn.phase !== "awaiting") return null;
	const stages = turn.decision.confirmation === "double" ? 2 : 1;
	const left = now > 0 ? formatLeft(approval.expiresAt - now) : "5:00";
	const ready = value.trim() === approval.phrase;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-4 rounded-sm border border-line bg-bg p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm font-medium",
					children: "Подтверждение"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "font-mono text-xs text-warn tabular-nums",
					children: [
						"этап ",
						approval.stage,
						"/",
						stages,
						" · ",
						left
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm text-muted",
				children: turn.decision.consequences.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: line }, line))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-sm",
				children: "Введите фразу целиком. «Да» не подойдёт."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 break-all font-mono text-sm text-paper",
				children: approval.phrase
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex flex-col gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value,
					onChange: (event) => setValue(event.target.value),
					"aria-label": "Фраза подтверждения",
					autoCapitalize: "off",
					autoCorrect: "off",
					spellCheck: false,
					className: "min-h-11 w-full rounded-sm border border-line bg-surface px-3 font-mono text-sm text-fg"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setValue(approval.phrase),
							className: "min-h-11 rounded-sm border border-line px-3 text-sm",
							children: "Вставить фразу"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: !ready,
							onClick: () => reply(turn.id, value),
							className: "min-h-11 rounded-sm bg-paper px-3 text-sm font-medium text-ink disabled:opacity-40",
							children: "Подтвердить"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => cancel(turn.id),
							className: "min-h-11 rounded-sm px-3 text-sm text-muted",
							children: "Отмена"
						})
					]
				})]
			})
		]
	});
}
function TurnCard({ turn, now }) {
	const labels = turn.source === "voice" ? STEP_VOICE : STEP_TEXT;
	const book = RUNBOOKS.find((item) => item.id === turn.decision.runbook);
	const resolveApproval = useJarvis((state) => state.resolveApproval);
	const operatorId = useJarvis((state) => state.operatorId);
	const actor = OPERATORS.find((item) => item.id === operatorId);
	const mayApprove = Boolean(actor && actor.allowed && canApprove(actor.role));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "turn-in rounded-xl border border-line bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RiskBadge, { risk: turn.decision.risk }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: `font-mono text-xs ${phaseTone(turn.phase, turn.decision.verdict)}`,
					children: stamp(turn)
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-3 text-lg font-semibold tracking-tight text-balance",
				children: turn.decision.title
			}),
			turn.trace ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
				className: "mt-3 grid gap-1 font-mono text-xs text-muted",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Code: ", turn.serverCode] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Original: ", turn.trace.original] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Normalized: ", turn.trace.normalized] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Steps: ", turn.trace.steps.join(" → ")] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Constraint: ", turn.trace.constraint] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Target: ", turn.trace.target] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Runbook: ", turn.trace.runbook] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Risk: ", turn.trace.risk] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Policy: ", turn.trace.policy] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Mode: ", turn.trace.mode] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Execution: ", turn.trace.execution] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Verification: ", turn.trace.verification] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Audit: ", turn.trace.audit] })
				]
			}) : null,
			turn.decision.reason ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-pretty text-sm text-fg",
				children: turn.decision.reason
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "mt-3 flex flex-wrap gap-x-3 gap-y-1",
				children: labels.map((label, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: `font-mono text-xs ${index < turn.step ? "text-moss" : "text-subtle"}`,
					children: [
						index + 1,
						" ",
						label
					]
				}, label))
			}),
			turn.toolRun ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 font-mono text-sm break-all text-paper",
				children: turn.decision.toolCall
			}),
			!turn.toolRun && turn.decision.parameters.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 font-mono text-xs text-subtle",
				children: turn.decision.parameters.map((item) => `${item.key}=${item.value}`).join(" · ")
			}) : null,
			turn.toolRun ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "mt-4 flex list-decimal flex-col gap-1 pl-4 text-sm text-muted",
				children: turn.decision.plan.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "text-pretty",
					children: line
				}, line))
			}),
			turn.decision.mutation && !turn.executed && turn.decision.verdict === "allow" && turn.phase !== "awaiting" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-4 flex flex-col gap-1 text-sm text-muted",
				children: turn.decision.consequences.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: line }, line))
			}) : null,
			book ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-3 text-sm text-muted",
				children: [
					"Runbook ",
					book.title,
					". Исполнитель: ",
					book.executor,
					". Таймаут: ",
					book.timeout,
					". Откат: ",
					book.rollback,
					"."
				]
			}) : null,
			turn.toolRun ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolRunCard, {
				calls: turn.toolRun.calls,
				assistant: turn.toolRun.assistant,
				mode: turn.toolRun.mode,
				canApprove: mayApprove,
				onDecide: (approvalId, decision) => void resolveApproval(approvalId, decision)
			}) : null,
			turn.showFindings ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 border-t border-line pt-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-xs text-subtle",
					children: "Отчёт шаблона, не живой опрос"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Findings, { items: turn.decision.findings })]
			}) : null,
			turn.hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-sm text-warn",
				children: turn.hint
			}) : null,
			turn.replies.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 flex flex-col gap-1",
				children: turn.replies.map((line, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "font-mono text-xs break-all text-subtle",
					children: line
				}, `${line}-${index}`))
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ApprovalBox, {
				turn,
				now
			}, turn.approval?.phrase ?? "none"),
			turn.phase !== "running" && turn.phase !== "awaiting" && turn.decision.recommendation ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 text-pretty text-sm",
				children: turn.decision.recommendation
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "mt-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
					className: "text-sm text-muted",
					children: "След политики"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-2 flex flex-col gap-1 font-mono text-xs text-subtle",
					children: turn.decision.policyNotes.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: line }, line))
				})]
			}),
			turn.durationMs != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-3 font-mono text-xs text-subtle tabular-nums",
				children: [
					turn.exitCode === null ? "без кода" : `код ${turn.exitCode}`,
					" · ",
					(turn.durationMs / 1e3).toFixed(1),
					" с"
				]
			}) : null
		]
	});
}
function SitePanel() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-sm font-medium",
				children: "Серверы"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted",
				children: "Не в коде агента, а в inventory. Демо-набор."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 flex flex-col",
				children: SERVERS.map((server) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "border-t border-line py-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-baseline justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono text-sm",
								children: server.id
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs text-subtle",
								children: server.type
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: server.roles.join(" · ")
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-subtle",
							children: server.note
						})
					]
				}, server.id))
			})
		] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "text-sm font-medium",
			children: "Runbooks"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-2",
			children: RUNBOOKS.map((book) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "border-t border-line",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", {
					className: "flex min-h-11 items-center justify-between gap-3 py-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm",
						children: book.title
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RiskBadge, { risk: book.risk })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col gap-1 pb-3 text-sm text-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-pretty",
							children: book.description
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Входы: ", book.inputs] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Проверка: ", book.validation] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Цели: ", book.targets] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Исполнитель: ", book.executor] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Таймаут: ", book.timeout] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Откат: ", book.rollback] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Верификация: ", book.verification] })
					]
				})]
			}, book.id))
		})] })]
	});
}
function AuditPanel() {
	const audit = useJarvis((state) => state.audit);
	const operatorId = useJarvis((state) => state.operatorId);
	const auditEpoch = useJarvis((state) => state.auditEpoch);
	const [toolAudit, setToolAudit] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		let cancel = false;
		listToolAudit({ data: { operatorId } }).then((result) => {
			if (!cancel) setToolAudit(result.forbidden ? [] : result.records);
		}).catch(() => {
			if (!cancel) setToolAudit([]);
		});
		return () => {
			cancel = true;
		};
	}, [operatorId, auditEpoch]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-sm font-medium",
					children: "Инструменты"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/admin/audit",
					className: "inline-flex min-h-11 items-center text-sm text-moss",
					children: "Админ-журнал"
				})]
			}),
			toolAudit === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted",
				children: "Читаю журнал…"
			}) : null,
			toolAudit && toolAudit.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted",
				children: "Вызовов ещё нет. SSH и MikroTik появятся здесь."
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 flex flex-col gap-3",
				children: toolAudit?.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "rounded-lg border border-line bg-bg p-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-baseline justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono text-xs text-moss",
								children: entry.result
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono text-xs text-subtle",
								children: entry.at.slice(11, 19)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 font-mono text-sm break-all",
							children: entry.command
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-2 font-mono text-xs text-subtle",
							children: [
								entry.actorName,
								" · ",
								entry.role,
								" · ",
								entry.tool,
								" · ",
								entry.risk
							]
						})
					]
				}, entry.id))
			})
		] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-sm font-medium",
				children: "Политика"
			}),
			audit.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted",
				children: "Журнал пуст. Каждая команда оставит след без секретов."
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 flex flex-col gap-3",
				children: audit.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "rounded-lg border border-line bg-bg p-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-baseline justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono text-xs text-moss",
								children: entry.result
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono text-xs text-subtle tabular-nums",
								children: formatClock(entry.at)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-sm text-pretty",
							children: entry.request
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-2 font-mono text-xs text-subtle",
							children: [
								entry.user,
								" · ",
								entry.source,
								" · ",
								entry.intent
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "font-mono text-xs text-subtle",
							children: [
								entry.tool,
								" · ",
								entry.target,
								" · L",
								entry.risk
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-xs break-all text-subtle",
							children: entry.parameters
						}),
						entry.approvalId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-xs text-warn",
							children: entry.approvalId
						}) : null,
						entry.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-danger",
							children: entry.error
						}) : null
					]
				}, entry.id))
			})
		] })]
	});
}
function AccessPanel() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-sm font-medium",
					children: "Уровни"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "mt-3 flex flex-col gap-2 text-sm text-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "L0 чтение — сразу. Логи, место, CI, маршруты." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "L1 низкий — сразу. Backup по шаблону." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "L2 изменение — фраза CONFIRM и номер заявки, 5 минут." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "L3 критический — две фразы. Ребут DC, firewall, удаление." })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-pretty text-sm text-muted",
					children: "SSH и MikroTik: read-only выполняется само, change показывает точную команду. Approve и Reject доступны только ролям operator и admin. Режим задаёт EXECUTION_MODE, по умолчанию dry-run."
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-sm font-medium",
					children: "Учётки"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted",
					children: "Одной всемогущей записи нет. Паролей в консоли нет."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 flex flex-col gap-2",
					children: ACCOUNTS.map((account) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-mono text-sm",
						children: account.id
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: account.scope
					})] }, account.id))
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-mono text-sm",
				children: ONEC_READER.id
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "mt-3 flex flex-col gap-2 text-sm",
				children: [ONEC_READER.allow.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "text-moss",
					children: ["можно · ", item]
				}, item)), ONEC_READER.deny.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "text-danger",
					children: ["нельзя · ", item]
				}, item))]
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-mono text-sm",
					children: ONEC_DEV.id
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted",
					children: "Только development и test. Постоянного admin нет."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "mt-3 flex flex-col gap-2 text-sm",
					children: [ONEC_DEV.allow.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "text-moss",
						children: ["можно · ", item]
					}, item)), ONEC_DEV.deny.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "text-danger",
						children: ["нельзя · ", item]
					}, item))]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-sm font-medium",
					children: "Контур"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 flex flex-col gap-2",
					children: SERVICES.map((service) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center justify-between gap-3 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: service.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono text-xs text-subtle",
							children: service.state
						})]
					}, service.name))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-pretty text-sm text-muted",
					children: "Это модель. PostgreSQL, Redis, Whisper и Semaphore здесь не запущены и к вашей сети не подключены."
				})
			] })
		]
	});
}
function ActorDeniedBanner() {
	useJarvis((state) => state.authCode);
	const authUserId = useJarvis((state) => state.authUserId);
	const user = useCurrentUser();
	const [copied, setCopied] = (0, import_react.useState)(false);
	authUserId || user && !user.isDevFallback && user.id;
	return null;
}
function Side({ tab }) {
	if (tab === "audit") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuditPanel, {});
	if (tab === "access") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccessPanel, {});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SitePanel, {});
}
var SIDE = [
	{
		id: "site",
		label: "Среда"
	},
	{
		id: "audit",
		label: "Журнал"
	},
	{
		id: "access",
		label: "Доступ"
	}
];
var started = false;
var adminTicketQueued = false;
function Console() {
	const turns = useJarvis((state) => state.turns);
	const now = useJarvis((state) => state.now);
	const busy = useJarvis((state) => state.busy);
	const dryRun = useJarvis((state) => state.dryRun);
	const serverMode = useJarvis((state) => state.serverMode);
	const watch = useJarvis((state) => state.watch);
	const notices = useJarvis((state) => state.notices);
	const actorId = useJarvis((state) => state.actorId);
	const operatorId = useJarvis((state) => state.operatorId);
	const sessionReady = useJarvis((state) => state.sessionReady);
	const setOperator = useJarvis((state) => state.setOperator);
	const setWatch = useJarvis((state) => state.setWatch);
	const pushNotice = useJarvis((state) => state.pushNotice);
	const ensureSession = useJarvis((state) => state.ensureSession);
	const submit = useJarvis((state) => state.submit);
	const tick = useJarvis((state) => state.tick);
	const [draft, setDraft] = (0, import_react.useState)("");
	const [voiceOpen, setVoiceOpen] = (0, import_react.useState)(false);
	const [callHandle, setCallHandle] = (0, import_react.useState)(null);
	const [hearing, setHearing] = (0, import_react.useState)(null);
	const [listening, setListening] = (0, import_react.useState)(false);
	const [live, setLive] = (0, import_react.useState)("");
	const [voiceNote, setVoiceNote] = (0, import_react.useState)(null);
	const [review, setReview] = (0, import_react.useState)(null);
	const [mobile, setMobile] = (0, import_react.useState)("dialog");
	const [panel, setPanel] = (0, import_react.useState)("site");
	const endRef = (0, import_react.useRef)(null);
	const callRef = (0, import_react.useRef)(null);
	const openingCall = (0, import_react.useRef)(false);
	callRef.current = callHandle;
	const recRef = (0, import_react.useRef)(null);
	const pendingRef = (0, import_react.useRef)("");
	const cancelRef = (0, import_react.useRef)(false);
	const voiceBusy = (0, import_react.useRef)(false);
	const silenceRef = (0, import_react.useRef)(null);
	const limitRef = (0, import_react.useRef)(null);
	const candidatesRef = (0, import_react.useRef)([]);
	const locked = !sessionReady || busy || hearing !== null || listening;
	const [toolMode, setToolMode] = (0, import_react.useState)("dry-run");
	const stranger = OPERATORS.find((item) => item.id === operatorId)?.allowed === false;
	(0, import_react.useEffect)(() => {
		const id = window.setInterval(() => tick(Date.now()), 1e3);
		return () => window.clearInterval(id);
	}, [tick]);
	(0, import_react.useEffect)(() => {
		let cancel = false;
		getToolStatus().then((status) => {
			if (!cancel) setToolMode(status.mode);
		}).catch(() => {
			if (!cancel) setToolMode("dry-run");
		});
		return () => {
			cancel = true;
		};
	}, []);
	(0, import_react.useEffect)(() => {
		if (started) return;
		started = true;
		ensureSession();
	}, [ensureSession]);
	(0, import_react.useEffect)(() => {
		if (adminTicketQueued) return;
		adminTicketQueued = true;
		submit("Создай заявку на учётку jarvis-1c-admin", "text");
	}, [submit]);
	(0, import_react.useEffect)(() => {
		if (!watch) return;
		for (const item of WATCH_ALERTS) pushNotice(item.id);
	}, [watch, pushNotice]);
	(0, import_react.useEffect)(() => {
		endRef.current?.scrollIntoView({ block: "end" });
	}, [
		turns,
		notices,
		hearing
	]);
	(0, import_react.useEffect)(() => {
		return () => {
			cancelRef.current = true;
			if (silenceRef.current) window.clearTimeout(silenceRef.current);
			if (limitRef.current) window.clearTimeout(limitRef.current);
			recRef.current?.abort();
		};
	}, []);
	(0, import_react.useEffect)(() => () => releaseVoiceCall(callRef.current), []);
	async function send(text, source) {
		const value = text.trim();
		if (!value || locked) return;
		if (source === "text") setDraft("");
		await submit(value, source);
	}
	function clearListenTimers() {
		if (silenceRef.current) window.clearTimeout(silenceRef.current);
		if (limitRef.current) window.clearTimeout(limitRef.current);
		silenceRef.current = null;
		limitRef.current = null;
	}
	async function acceptVoice(text, heard) {
		const value = text.trim();
		if (!value || voiceBusy.current) return;
		voiceBusy.current = true;
		setVoiceOpen(false);
		setLive("");
		setVoiceNote(null);
		setReview(null);
		setMobile("dialog");
		setHearing(value);
		try {
			await sleep(700);
			setHearing(null);
			await submit(value, "voice", heard);
		} finally {
			voiceBusy.current = false;
		}
	}
	function settleVoice() {
		const awaiting = useJarvis.getState().turns.some((item) => item.phase === "awaiting");
		const alts = candidatesRef.current.length ? candidatesRef.current : pendingRef.current ? [{
			transcript: pendingRef.current,
			confidence: 1
		}] : [];
		candidatesRef.current = [];
		pendingRef.current = "";
		if (!alts.length) {
			setVoiceNote("no-speech");
			return;
		}
		if (awaiting) {
			acceptVoice(alts[0].transcript);
			return;
		}
		const reading = interpretSpeech(alts);
		if (!reading.text) {
			setVoiceNote("no-speech");
			return;
		}
		if (reading.uncertain) {
			setReview(reading);
			setLive(reading.raw);
			return;
		}
		acceptVoice(reading.text, reading.raw);
	}
	function beginVoice() {
		if (busy || hearing || voiceBusy.current || callHandle) return;
		const previous = recRef.current;
		recRef.current = null;
		if (previous) {
			previous.onresult = null;
			previous.onerror = null;
			previous.onend = null;
			previous.abort();
		}
		cancelRef.current = false;
		pendingRef.current = "";
		candidatesRef.current = [];
		clearListenTimers();
		setLive("");
		setVoiceNote(null);
		setReview(null);
		setVoiceOpen(true);
		setMobile("dialog");
		const rec = createRecognizer();
		if (!rec) {
			setListening(false);
			setVoiceNote("unsupported");
			return;
		}
		recRef.current = rec;
		setListening(true);
		rec.onresult = (event) => {
			const alts = alternativesFrom(event.results);
			if (!alts.length) return;
			candidatesRef.current = alts;
			pendingRef.current = alts[0].transcript;
			setLive(alts[0].transcript);
			if (silenceRef.current) window.clearTimeout(silenceRef.current);
			silenceRef.current = window.setTimeout(() => {
				silenceRef.current = null;
				recRef.current?.stop();
			}, 900);
		};
		rec.onerror = (event) => {
			if (event.error === "aborted" || event.error === "no-speech") return;
			cancelRef.current = true;
			setListening(false);
			setVoiceNote(event.error);
		};
		rec.onend = () => {
			clearListenTimers();
			setListening(false);
			recRef.current = null;
			if (cancelRef.current) {
				cancelRef.current = false;
				return;
			}
			settleVoice();
		};
		try {
			rec.start();
			limitRef.current = window.setTimeout(() => {
				limitRef.current = null;
				recRef.current?.stop();
			}, 12e3);
		} catch {
			setListening(false);
			recRef.current = null;
			setVoiceNote("audio-capture");
		}
	}
	function finishVoice() {
		clearListenTimers();
		const rec = recRef.current;
		if (!rec) {
			settleVoice();
			return;
		}
		rec.stop();
	}
	async function openCall() {
		if (listening || hearing || callHandle || openingCall.current) return;
		openingCall.current = true;
		cancelVoice();
		try {
			const opened = await beginVoiceCall();
			setCallHandle(opened);
		} finally {
			openingCall.current = false;
		}
	}
	function closeCall() {
		setCallHandle((current) => {
			releaseVoiceCall(current);
			return null;
		});
	}
	function cancelVoice() {
		cancelRef.current = true;
		pendingRef.current = "";
		candidatesRef.current = [];
		clearListenTimers();
		const rec = recRef.current;
		recRef.current = null;
		if (rec) {
			rec.onresult = null;
			rec.onerror = null;
			rec.onend = null;
			rec.abort();
		}
		setListening(false);
		setVoiceOpen(false);
		setLive("");
		setVoiceNote(null);
		setReview(null);
	}
	const reading = live ? interpretSpeech([{
		transcript: live,
		confidence: 1
	}]) : null;
	const awaiting = turns.find((item) => item.phase === "awaiting") ?? null;
	const recognized = Boolean(reading && reading.changed && !reading.uncertain && reading.text);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex h-dvh flex-col bg-bg text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "border-b border-line",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between gap-3 px-4 pt-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-xs text-moss",
							children: "DEMO"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "text-xl font-semibold tracking-tight",
							children: "JARVIS"
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex shrink-0 gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-pressed": watch,
								onClick: () => setWatch(!watch),
								className: "min-h-11 rounded-md px-3 font-mono text-xs " + (watch ? "bg-forest text-paper" : "border border-line text-muted"),
								children: watch ? "Слежу" : "Пауза"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "flex min-h-11 items-center rounded-md bg-forest px-3 font-mono text-xs text-paper",
								children: serverMode === "real" ? "REAL" : serverMode === "mock" ? "MOCK" : "DRY RUN"
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between gap-3 px-4 pt-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "font-mono text-xs text-subtle",
							children: ["Session actor: ", actorId]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserButton, {})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4",
						children: OPERATORS.map((operator) => {
							const active = operator.id === operatorId;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setOperator(operator.id),
								className: "min-h-11 rounded-md border px-1 text-xs " + (active ? "border-paper bg-paper text-ink" : "border-line text-muted"),
								children: operator.allowed ? operator.role : "чужой"
							}, operator.id);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "px-4 font-mono text-xs text-subtle",
						children: watch ? "MONITORING_NOT_CONFIGURED. Ниже только demo-фикстуры, не телеметрия." : "Слежение на паузе."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "px-4 pb-3 font-mono text-xs text-moss",
						children: [
							"tools ",
							toolMode,
							toolMode === "dry-run" ? " · команды на хосты не уходят" : " · чтение сразу, change после Approve"
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "flex gap-2 overflow-x-auto px-4 py-3",
						children: WATCH_HOSTS.map((host) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex shrink-0 items-center gap-2 rounded-full border border-line px-3 py-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `size-2 rounded-full ${levelDot(host.level)}`,
									"aria-hidden": "true"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-xs",
									children: host.id
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs text-subtle",
									children: host.note
								})
							]
						}, host.id))
					})
				]
			}),
			stranger ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "border-b border-line px-4 py-2 text-sm text-danger",
				children: "Этот Telegram ID не в allowlist. Команды будут отклонены."
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActorDeniedBanner, {}),
			!dryRun ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "border-b border-line bg-paper px-4 py-2 text-sm text-ink",
				children: "Сервер в режиме REAL. Кнопка в браузере этот режим не включает."
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex min-h-0 flex-1 flex-col lg:flex-row",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: `${mobile === "dialog" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col lg:flex`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4",
						"aria-live": "polite",
						children: [
							turns.length === 0 && notices.length === 0 && !hearing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-col gap-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "max-w-xl text-pretty text-muted",
									children: "Слежение уже смотрит узлы. Если что-то сломается, я напишу где, что случилось и что делать. Сам ничего не чиню."
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "flex flex-col gap-2",
									children: VOICE_PRESETS.slice(0, 3).map((preset) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => void send(preset.text.replace(/^Джарвис, /, ""), "text"),
										className: "min-h-11 rounded-lg border border-line px-3 text-left text-sm",
										children: preset.text
									}, preset.id))
								})]
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Thread, {
								notices,
								turns,
								now,
								locked,
								onOpen: (command) => void send(command, "text")
							}),
							hearing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "turn-in rounded-xl border border-line bg-surface p-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "font-mono text-xs text-moss",
										children: "TRANSCRIBING"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-3",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wave, {})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-3 text-pretty text-sm text-muted",
										children: hearing
									})
								]
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref: endRef })
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						className: "border-t border-line p-3",
						onSubmit: (event) => {
							event.preventDefault();
							send(draft, "text");
						},
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex gap-2 overflow-x-auto pb-2",
							children: SUGGESTIONS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: locked,
								onClick: () => void send(item.text, "text"),
								className: "min-h-11 shrink-0 rounded-full border border-line px-3 text-sm text-muted disabled:opacity-40",
								children: item.label
							}, item.label))
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									value: draft,
									onChange: (event) => setDraft(event.target.value),
									disabled: locked,
									placeholder: "Команда или фраза CONFIRM…",
									"aria-label": "Команда",
									className: "min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-fg disabled:opacity-40"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": listening ? "Остановить запись" : "Голосовая команда",
									"aria-pressed": listening,
									disabled: busy || hearing !== null || callHandle !== null,
									onClick: () => listening ? finishVoice() : beginVoice(),
									className: "flex size-11 shrink-0 items-center justify-center rounded-md disabled:opacity-40 " + (listening ? "bg-forest text-paper" : "border border-line"),
									children: listening ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, {
										className: "size-4",
										"aria-hidden": "true"
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mic, {
										className: "size-5",
										"aria-hidden": "true"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": "Голосовой разговор",
									"aria-pressed": callHandle !== null,
									disabled: listening || hearing !== null,
									onClick: () => void openCall(),
									className: "flex size-11 shrink-0 items-center justify-center rounded-md border border-line disabled:opacity-40",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Phone, {
										className: "size-5",
										"aria-hidden": "true"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "submit",
									"aria-label": "Отправить",
									disabled: locked || draft.trim() === "",
									className: "flex size-11 items-center justify-center rounded-md bg-paper text-ink disabled:opacity-40",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUp, {
										className: "size-5",
										"aria-hidden": "true"
									})
								})
							]
						})]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
					className: `${mobile === "dialog" ? "hidden" : "flex"} min-h-0 w-full flex-col border-line lg:flex lg:w-96 lg:border-l`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "hidden gap-2 px-4 pt-3 lg:flex",
						children: SIDE.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setPanel(item.id),
							className: "min-h-11 flex-1 rounded-md text-sm " + (panel === item.id ? "bg-paper text-ink" : "text-muted"),
							children: item.label
						}, item.id))
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "min-h-0 flex-1 overflow-y-auto px-4 py-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Side, { tab: mobile === "dialog" ? panel : mobile })
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
				className: "grid grid-cols-4 border-t border-line lg:hidden",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
						label: "Диалог",
						active: mobile === "dialog",
						onClick: () => setMobile("dialog"),
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageSquare, {
							className: "size-5",
							"aria-hidden": "true"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
						label: "Среда",
						active: mobile === "site",
						onClick: () => {
							setPanel("site");
							setMobile("site");
						},
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Server, {
							className: "size-5",
							"aria-hidden": "true"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
						label: "Журнал",
						active: mobile === "audit",
						onClick: () => {
							setPanel("audit");
							setMobile("audit");
						},
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollText, {
							className: "size-5",
							"aria-hidden": "true"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
						label: "Доступ",
						active: mobile === "access",
						onClick: () => {
							setPanel("access");
							setMobile("access");
						},
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyRound, {
							className: "size-5",
							"aria-hidden": "true"
						})
					})
				]
			}),
			voiceOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "fixed inset-0 z-20 flex items-end bg-ink/80",
				onClick: cancelVoice,
				role: "presentation",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					role: "dialog",
					"aria-label": "Голосовая команда",
					className: "max-h-full w-full overflow-y-auto rounded-t-xl border border-line bg-surface p-4",
					onClick: (event) => event.stopPropagation(),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-lg font-semibold tracking-tight",
								children: listening ? "LISTENING" : "Голос"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-pretty text-sm text-muted",
								children: "Говорите целиком и сделайте короткую паузу. Похожие слова сверяю со списком команд, опасные не угадываю."
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": "Закрыть",
								onClick: cancelVoice,
								className: "flex size-11 items-center justify-center",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {
									className: "size-5",
									"aria-hidden": "true"
								})
							})]
						}),
						listening || live ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4",
							"aria-live": "polite",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wave, {}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 min-h-6 text-pretty text-sm",
									children: live || "Говорите"
								}),
								recognized && reading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-sm text-moss",
									children: ["разбор: ", reading.text]
								}) : null
							]
						}) : null,
						voiceNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-4 text-pretty text-sm text-warn",
							children: voiceNoteText(voiceNote)
						}) : null,
						review?.uncertain ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-pretty text-sm",
								children: [
									"Услышал «",
									review.raw,
									"». Уточните команду."
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 flex flex-col gap-2",
								children: [review.choices.map((choice) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => void acceptVoice(choice.text, review.raw),
									className: "min-h-11 rounded-md border border-line px-3 text-left text-sm",
									children: choice.label
								}, choice.text)), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => void acceptVoice(review.raw),
									className: "min-h-11 px-3 text-left text-sm text-muted",
									children: "Оставить как услышано"
								})]
							})]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4 flex flex-wrap gap-2",
							children: [listening ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: finishVoice,
								className: "min-h-11 rounded-md bg-paper px-3 text-sm font-medium text-ink",
								children: "Готово"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: beginVoice,
								className: "min-h-11 rounded-md bg-paper px-3 text-sm font-medium text-ink",
								children: voiceNote ? "Повторить" : "Слушать"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: cancelVoice,
								className: "min-h-11 rounded-md px-3 text-sm text-muted",
								children: "Отмена"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-5 text-sm text-subtle",
							children: "Или пример фразы"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-2 flex flex-col gap-2",
							children: VOICE_PRESETS.map((preset) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => {
									clearListenTimers();
									const rec = recRef.current;
									recRef.current = null;
									if (rec) {
										rec.onresult = null;
										rec.onerror = null;
										rec.onend = null;
										rec.abort();
									}
									setListening(false);
									acceptVoice(preset.text);
								},
								className: "flex min-h-11 items-center justify-between gap-3 rounded-md border border-line px-3 text-left text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-pretty",
									children: preset.text
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-xs text-subtle tabular-nums",
									children: preset.length
								})]
							}, preset.id))
						})
					]
				})
			}) : null,
			callHandle ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VoiceCall, {
				handle: callHandle,
				approval: awaiting ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ApprovalBox, {
					turn: awaiting,
					now
				}) : null,
				onClose: closeCall
			}) : null
		]
	});
}
function levelDot(level) {
	if (level === "bad") return "bg-danger-deep";
	if (level === "warn") return "bg-warn";
	return "bg-moss";
}
function NoticeCard({ notice, disabled, onOpen }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "turn-in rounded-xl border border-line bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "font-mono text-xs text-moss",
				children: [
					"слежение · ",
					notice.host,
					" · ",
					notice.area
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-2 text-lg font-semibold tracking-tight text-balance",
				children: notice.title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-3 text-pretty text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-subtle",
					children: "Где. "
				}), notice.where]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 text-pretty text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-subtle",
					children: "Что случилось. "
				}), notice.broke]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 text-pretty text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-subtle",
					children: "Что сделать. "
				}), notice.fix]
			}),
			notice.command ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				disabled,
				onClick: () => onOpen(notice.command ?? ""),
				className: "mt-4 min-h-11 rounded-md border border-line px-3 text-left text-sm disabled:opacity-40",
				children: notice.command
			}) : null
		]
	});
}
function Thread({ notices, turns, now, locked, onOpen }) {
	return [...notices.map((notice) => ({
		kind: "notice",
		at: notice.at,
		notice,
		turn: null
	})), ...turns.map((turn) => ({
		kind: "turn",
		at: turn.at,
		notice: null,
		turn
	}))].sort((left, right) => left.at - right.at).map((item) => {
		if (item.notice) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoticeCard, {
			notice: item.notice,
			disabled: locked,
			onOpen
		}, item.notice.id);
		if (!item.turn) return null;
		const turn = item.turn;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "ml-8 rounded-lg bg-elevated px-3 py-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "font-mono text-xs text-subtle",
						children: [
							turn.source === "voice" ? "голос" : "текст",
							" · ",
							formatClock(turn.at)
						]
					}),
					turn.heard ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xs text-subtle",
						children: ["услышано: ", turn.heard]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-pretty text-sm",
						children: turn.request
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TurnCard, {
				turn,
				now
			})]
		}, turn.id);
	});
}
function NavButton({ label, active, onClick, icon }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: `flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${active ? "text-paper" : "text-subtle"}`,
		children: [icon, label]
	});
}
function Home() {
	const { user, isPending } = useCurrentUserState();
	if (isPending) return null;
	if (!user) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RedirectToSignIn, {});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Console, {});
}
//#endregion
export { Home as component };
