(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const baseMidiC4 = 60; // middle C

    // soundfont-player 支持检测
    const soundfontAvailable = typeof Soundfont !== 'undefined';
    const sfCache = {};
    function loadInstrument(name) {
        if (!soundfontAvailable) return Promise.reject(new Error('Soundfont not available'));
        if (sfCache[name]) return Promise.resolve(sfCache[name]);
        return Soundfont.instrument(ctx, name).then(inst => { sfCache[name] = inst; return inst; });
    }

    function midiToNoteName(m) {
        const n = ((m % 12) + 12) % 12;
        const octave = Math.floor(m / 12) - 1;
        return noteNames[n] + octave;
    }

    // 键位到和弦（相对于 C 的半音）
    const chordMap = {
        '1': { name: 'C', offs: [0, 4, 7] },
        'q': { name: 'Cm', offs: [0, 3, 7] },
        '2': { name: 'Dm', offs: [2, 5, 9] },
        'w': { name: 'D', offs: [2, 6, 9] },
        '3': { name: 'Em', offs: [4, 7, 11] },
        'e': { name: 'E', offs: [4, 8, 11] },
        'd': { name: 'E7', offs: [4, 8, 11, 14] },
        '4': { name: 'F', offs: [5, 9, 12] },
        'r': { name: 'Fm', offs: [5, 9, 12] },
        '5': { name: 'G', offs: [7, 11, 14] },
        't': { name: 'Gm', offs: [7, 10, 14] },
        'g': { name: 'G7', offs: [7, 11, 14, 17] },
        '6': { name: 'Am', offs: [9, 12, 16] },
        'y': { name: 'A', offs: [9, 13, 16] },
        '7': { name: 'Bdim', offs: [11, 14, 17] }
    };

    const tonicSelect = document.getElementById('tonic');
    const voiceSelect = document.getElementById('voice');
    const mappingEl = document.getElementById('mapping');
    const statusEl = document.getElementById('status');

    for (let i = 0; i < 12; i++) {
        const opt = document.createElement('option'); opt.value = i; opt.textContent = noteNames[i];
        tonicSelect.appendChild(opt);
    }

    function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    function playChord(key) {
        const info = chordMap[key]; if (!info) return;
        const tonic = +tonicSelect.value; // semitone shift relative to C
        const voice = voiceSelect.value;
        statusEl.textContent = `播放：${info.name}（键 ${key.toUpperCase()}），音色：${voice}，移调：${noteNames[tonic]}`;

        const now = ctx.currentTime;
        const offs = info.offs;

        // 若 soundfont 可用，则优先使用样本（更真实），否则回退到 Oscillator
        if (soundfontAvailable) {
            console.log('Using Soundfont for instrument:', voice);
            const instName = (voice === 'strings') ? 'violin' : 'acoustic_grand_piano';
            loadInstrument(instName).then(inst => {
                if (ctx.state === 'suspended') ctx.resume();
                offs.forEach((o, i) => {
                    const midi = baseMidiC4 + o + tonic;
                    const note = midiToNoteName(midi);
                    // Soundfont player 返回的 instrument 有 play(note, when, opts)
                    inst.play(note, now, { gain: 0.85 / (i + 1) });
                });
            }).catch(() => {
                // 回退实现
                playChordFallback(offs, tonic, voice);
            });
        } else {
            console.log('Fallback to Oscillator for instrument:', voice);
            playChordFallback(offs, tonic, voice);
        }
    }

    function playChordFallback(offs, tonic, voice) {
        const now = ctx.currentTime;
        offs.forEach((o, i) => {
            const midi = baseMidiC4 + o + tonic;
            const freq = midiToFreq(midi);
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            let type = 'sine';
            let attack = 0.01, release = 0.8;
            if (voice === 'piano') {
                type = (i === 0) ? 'square' : 'sine'; attack = 0.001; release = 0.9;
            } else {
                type = 'sawtooth'; attack = 0.2; release = 1.6;
            }
            osc.type = type; osc.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, now);
            g.gain.linearRampToValueAtTime(0.9 / (i + 1), now + attack);
            g.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
            osc.connect(g);
            g.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + attack + release + 0.05);
        });
    }

    // 渲染键位映射
    Object.keys(chordMap).forEach(k => {
        const el = document.createElement('div'); el.className = 'map-item';
        el.id = 'map-' + k;
        el.innerHTML = `<strong>${k.toUpperCase()}</strong> → ${chordMap[k].name}`;
        mappingEl.appendChild(el);
    });

    const activeSet = new Set();
    window.addEventListener('keydown', (ev) => {
        if (ev.repeat) return;
        const k = ev.key.toLowerCase();
        if (chordMap[k]) {
            // resume audio context on first interaction
            if (ctx.state === 'suspended') ctx.resume();
            activeSet.add(k);
            const el = document.getElementById('map-' + k); if (el) el.classList.add('active');
            playChord(k);
        }
    });
    window.addEventListener('keyup', (ev) => {
        const k = ev.key.toLowerCase(); activeSet.delete(k); const el = document.getElementById('map-' + k); if (el) el.classList.remove('active');
    });

    // 鼠标点击也可触发
    mappingEl.addEventListener('click', (ev) => {
        const it = ev.target.closest('.map-item'); if (!it) return; const k = it.id.replace('map-', ''); playChord(k);
    });

    // 小提示：打开控制台可查看 MIDI 对应频率。
    console.log('ChordKeyboard loaded. 键位映射：', chordMap);
})();
