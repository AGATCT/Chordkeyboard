(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let ctx = null;
    let isInitialized = false;
    
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const baseMidiC4 = 60; // middle C

    // 检查 soundfont-player
    let soundfontAvailable = false;
    const sfCache = {};
    
    // 键位到和弦
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
    const octaveSelect = document.getElementById('octave');
    const voiceSelect = document.getElementById('voice');
    const mappingEl = document.getElementById('mapping');
    const statusEl = document.getElementById('status');

    // 初始化选项
    for (let i = 0; i < 12; i++) {
        const opt = document.createElement('option'); 
        opt.value = i; 
        opt.textContent = noteNames[i];
        tonicSelect.appendChild(opt);
    }

    // 工具函数
    function midiToFreq(m) { 
        return 440 * Math.pow(2, (m - 69) / 12); 
    }
    
    function midiToNoteName(m) {
        const n = ((m % 12) + 12) % 12;
        const octave = Math.floor(m / 12) - 1;
        return noteNames[n] + octave;
    }

    // 初始化音频系统
    async function initAudio() {
        if (isInitialized) return true;
        
        try {
            // 1. 创建 AudioContext
            ctx = new AudioContext();
            
            // 2. 检查 soundfont
            soundfontAvailable = typeof Soundfont !== 'undefined';
            console.log('Soundfont 可用:', soundfontAvailable);
            
            // 3. 如果有 soundfont，预加载默认音色
            if (soundfontAvailable) {
                const defaultInst = voiceSelect.value === 'strings' ? 'violin' : 'acoustic_grand_piano';
                statusEl.textContent = '正在加载音色...';
                
                try {
                    const inst = await Soundfont.instrument(ctx, defaultInst);
                    sfCache[defaultInst] = inst;
                    console.log('音色预加载成功:', defaultInst);
                } catch (err) {
                    console.warn('音色预加载失败，将使用回退音色:', err);
                }
            }
            
            isInitialized = true;
            statusEl.textContent = '音频已初始化，可以开始演奏！';
            return true;
            
        } catch (error) {
            console.error('音频初始化失败:', error);
            statusEl.textContent = '音频初始化失败，但可以使用基础音色';
            // 即使失败，也尝试继续
            ctx = new AudioContext();
            isInitialized = true;
            return false;
        }
    }

    // 加载音色函数
    async function loadInstrument(name) {
        if (!soundfontAvailable) throw new Error('Soundfont not available');
        if (sfCache[name]) return sfCache[name];
        
        const inst = await Soundfont.instrument(ctx, name);
        sfCache[name] = inst;
        return inst;
    }

    // 播放和弦
    async function playChord(key) {
        const info = chordMap[key];
        if (!info) return;
        
        const tonic = +tonicSelect.value;
        const octave = +octaveSelect.value;
        const voice = voiceSelect.value;
        
        // 更新状态
        statusEl.textContent = `播放：${info.name}（键 ${key.toUpperCase()}）`;
        
        // 确保音频已初始化
        if (!isInitialized) {
            await initAudio();
        }
        
        // 确保 AudioContext 处于运行状态
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
        
        const now = ctx.currentTime;
        const offs = info.offs;
        
        // 尝试使用 soundfont
        if (soundfontAvailable) {
            try {
                const instName = voice === 'strings' ? 'violin' : 'acoustic_grand_piano';
                const inst = await loadInstrument(instName);
                
                offs.forEach((o, i) => {
                    const midi = baseMidiC4 + o + tonic + octave;
                    const note = midiToNoteName(midi);
                    inst.play(note, now, { 
                        gain: 0.85 / (i + 1),
                        duration: 2
                    });
                });
                return;
            } catch (err) {
                console.warn('Soundfont 播放失败，使用回退音色:', err);
            }
        }
        
        // 回退到 Oscillator
        playChordFallback(offs, tonic, octave, voice);
    }
    
    function playChordFallback(offs, tonic, octave, voice) {
        const now = ctx.currentTime;
        offs.forEach((o, i) => {
            const midi = baseMidiC4 + o + tonic + octave;
            const freq = midiToFreq(midi);
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            
            let type = 'sine';
            let attack = 0.01, release = 0.8;
            
            if (voice === 'piano') {
                type = (i === 0) ? 'square' : 'sine'; 
                attack = 0.001; 
                release = 0.9;
            } else {
                type = 'sawtooth'; 
                attack = 0.2; 
                release = 1.6;
            }
            
            osc.type = type; 
            osc.frequency.value = freq;
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
        const el = document.createElement('div'); 
        el.className = 'map-item';
        el.id = 'map-' + k;
        el.innerHTML = `<strong>${k.toUpperCase()}</strong> → ${chordMap[k].name}`;
        mappingEl.appendChild(el);
    });

    const activeSet = new Set();
    
    // 键盘事件处理
    window.addEventListener('keydown', async (ev) => {
        if (ev.repeat) return;
        
        const k = ev.key.toLowerCase();
        if (chordMap[k]) {
            ev.preventDefault();
            
            // 激活视觉反馈
            activeSet.add(k);
            const el = document.getElementById('map-' + k); 
            if (el) el.classList.add('active');
            
            // 播放和弦
            await playChord(k);
        }
    });
    
    window.addEventListener('keyup', (ev) => {
        const k = ev.key.toLowerCase(); 
        activeSet.delete(k); 
        const el = document.getElementById('map-' + k); 
        if (el) el.classList.remove('active');
    });

    // 点击事件处理
    mappingEl.addEventListener('click', async (ev) => {
        const it = ev.target.closest('.map-item'); 
        if (!it) return; 
        const k = it.id.replace('map-', ''); 
        await playChord(k);
    });

    // 页面加载完成后的初始化
    document.addEventListener('DOMContentLoaded', () => {
        // 更新状态提示
        statusEl.textContent = '点击任意和弦或按键盘键开始演奏（需要用户交互激活音频）';
        
        // 添加页面点击激活音频
        document.addEventListener('click', async () => {
            if (!isInitialized) {
                await initAudio();
                statusEl.textContent = '音频已激活！可以开始演奏和弦。';
            }
        }, { once: true });
        
        // 检查 soundfont 是否加载
        const checkSoundfont = setInterval(() => {
            if (typeof Soundfont !== 'undefined') {
                soundfontAvailable = true;
                console.log('Soundfont-player 已加载');
                clearInterval(checkSoundfont);
            }
        }, 100);
        
        // 10秒后停止检查
        setTimeout(() => clearInterval(checkSoundfont), 10000);
        
        console.log('ChordKeyboard 已加载。按 1-7 或 Q/Y 等键演奏和弦');
    });
})();