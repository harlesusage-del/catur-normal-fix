/* =============================================
   GENIUS CHESS — MODE BATTLE ROYALE (br.js)
   Turn-based MOBA hybrid on a chess board.
   Requires script.js to be loaded first.
   ============================================= */

'use strict';

// =============================================
// BR CONSTANTS
// =============================================

const BR_STATS = {
    P: { hp: 6,  atk: 2, def: 0, mana: 0, maxMana: 10, name: 'Pion' },
    N: { hp: 10, atk: 4, def: 1, mana: 0, maxMana: 10, name: 'Kuda' },
    B: { hp: 8,  atk: 3, def: 1, mana: 0, maxMana: 10, name: 'Uskup' },
    R: { hp: 16, atk: 4, def: 3, mana: 0, maxMana: 10, name: 'Benteng' },
    Q: { hp: 12, atk: 6, def: 1, mana: 0, maxMana: 10, name: 'Ratu' },
    K: { hp: 22, atk: 3, def: 2, mana: 0, maxMana: 10, name: 'Raja' },
};

// Skills: each piece has 3 skills
const BR_SKILLS = {
    P: [
        { id:'P1', name:'Brave Strike',  cost:2, cd:2, desc:'+2 ATK selama 1 giliran.',       icon:'⚔' },
        { id:'P2', name:'Guard Step',    cost:2, cd:3, desc:'+2 DEF selama 1 giliran.',        icon:'🛡' },
        { id:'P3', name:'Last Stand',    cost:3, cd:4, desc:'Jika HP≤3: +3 ATK 1 giliran.',   icon:'🔥' },
    ],
    N: [
        { id:'N1', name:'Shadow Dash',   cost:3, cd:3, desc:'Langkah L tambahan instan.',      icon:'💨' },
        { id:'N2', name:'Backstab',      cost:3, cd:2, desc:'Dari belakang: +3 dmg.',          icon:'🗡' },
        { id:'N3', name:'Execute',       cost:4, cd:4, desc:'Target HP≤5: +5 dmg.',            icon:'💀' },
    ],
    B: [
        { id:'B1', name:'Heal',          cost:3, cd:3, desc:'Pulihkan 4 HP ke ally diagonal.', icon:'💚' },
        { id:'B2', name:'Blessing',      cost:3, cd:3, desc:'Target ally +2 ATK 2 giliran.',   icon:'✨' },
        { id:'B3', name:'Cleanse',       cost:4, cd:5, desc:'Hilangkan debuff + reset 1 CD.',  icon:'🌟' },
    ],
    R: [
        { id:'R1', name:'Fortify',       cost:3, cd:4, desc:'+3 DEF selama 2 giliran.',        icon:'🏰' },
        { id:'R2', name:'Taunt',         cost:3, cd:4, desc:'Musuh radius 1 wajib serang Rook next turn.', icon:'😤' },
        { id:'R3', name:'Ground Slam',   cost:4, cd:5, desc:'AOE radius 1 dmg 3 true dmg.',   icon:'💥' },
    ],
    Q: [
        { id:'Q1', name:'Arcane Bolt',   cost:3, cd:2, desc:'Serang lurus 2 kotak depan.',     icon:'🔵' },
        { id:'Q2', name:'Blink',         cost:3, cd:3, desc:'Teleport 2 kotak ke arah mana saja.', icon:'⚡' },
        { id:'Q3', name:'Arcane Storm',  cost:5, cd:5, desc:'AOE 3×3 damage 5 true dmg.',      icon:'🌀' },
    ],
    K: [
        { id:'K1', name:'Royal Guard',   cost:3, cd:4, desc:'Ally radius 1 +2 DEF 1 giliran.', icon:'👑' },
        { id:'K2', name:'Inspire',       cost:3, cd:4, desc:'Semua Pion ally +1 ATK 2 giliran.',icon:'📯' },
        { id:'K3', name:'Final Stand',   cost:5, cd:5, desc:'Jika HP≤10: semua ally +2 ATK 1 giliran.', icon:'⚔' },
    ],
};

const BR_SPELLS = [
    { id:'SP_FLICKER',   name:'Flicker',      energy:3, desc:'Teleport 2 kotak instan.',           icon:'⚡' },
    { id:'SP_EXECUTE',   name:'Execute',       energy:4, desc:'Instant kill target HP≤4.',          icon:'💀' },
    { id:'SP_AEGIS',     name:'Aegis',         energy:3, desc:'Shield 5 HP ke 1 ally.',             icon:'🛡' },
    { id:'SP_RETRIB',    name:'Retribution',   energy:4, desc:'3 true dmg ke 1 musuh.',             icon:'🔥' },
    { id:'SP_BARRIER',   name:'Barrier',       energy:3, desc:'+3 DEF ke 1 ally 2 giliran.',        icon:'🔷' },
    { id:'SP_IGNITE',    name:'Ignite',        energy:2, desc:'2 dmg per giliran selama 2 turn (DoT).', icon:'🌋' },
];

const BR_SUDDEN_DEATH_TURN = 40;

// =============================================
// BR GAME STATE (stored in gameState.br)
// =============================================

function brInitState() {
    return {
        // Per-cell unit stats: key="r,c" → { hp, maxHp, atk, baseAtk, def, baseDef, mana, buffs:[], debuffs:[], cdMap:{skillId:turns} }
        units: {},
        // Per-player spell selections & energy
        spells: {
            white: { selected: ['SP_FLICKER','SP_RETRIB'], energy: 10, cd: { SP_FLICKER:0, SP_RETRIB:0, SP_EXECUTE:0, SP_AEGIS:0, SP_BARRIER:0, SP_IGNITE:0 } },
            black: { selected: ['SP_FLICKER','SP_RETRIB'], energy: 10, cd: { SP_FLICKER:0, SP_RETRIB:0, SP_EXECUTE:0, SP_AEGIS:0, SP_BARRIER:0, SP_IGNITE:0 } },
        },
        // Current turn action state
        turn: {
            phase: 'select',      // 'select' | 'moved' | 'skill-target' | 'spell-target' | 'basic-target' | 'done'
            selectedPiece: null,  // {row,col}
            movedTo: null,        // {row,col} after move
            skillUsed: false,
            spellUsed: false,
            basicAttacked: false,
            pendingSkill: null,   // skill id
            pendingSpell: null,   // spell id
            actionDone: false,    // true = end turn
        },
        turnCount: 0,
        taunted: { white: null, black: null }, // {row,col} or null — who's taunted
        combatLog: [],   // last N messages
        // Spell setup phase
        setupPhase: true,
        setupPlayer: 'white', // which player is selecting spells
        whiteSpells: [],
        blackSpells: [],
    };
}

// =============================================
// BR KEY HELPERS
// =============================================

function brKey(r, c) { return `${r},${c}`; }

function brGetUnit(r, c) { return gameState.br.units[brKey(r, c)] || null; }

function brSetUnit(r, c, u) { gameState.br.units[brKey(r, c)] = u; }

function brDelUnit(r, c) { delete gameState.br.units[brKey(r, c)]; }

function brMoveUnit(fr, fc, tr, tc) {
    const u = brGetUnit(fr, fc);
    if (!u) return;
    brDelUnit(fr, fc);
    brSetUnit(tr, tc, u);
}

function brMkUnit(type) {
    const s = BR_STATS[type];
    return {
        hp: s.hp, maxHp: s.hp,
        atk: s.atk, baseAtk: s.atk,
        def: s.def, baseDef: s.def,
        mana: 0, maxMana: s.maxMana,
        buffs: [],    // [{stat, amount, turns}]
        debuffs: [],  // [{type, amount, turns}]
        cdMap: {},    // {skillId: turnsLeft}
        taunted: false,
        dotEffects: [], // [{dmg, turns}]
    };
}

// =============================================
// BR INIT
// =============================================

function brInit(board) {
    gameState.br = brInitState();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p) brSetUnit(r, c, brMkUnit(p.type));
        }
    }
}

// =============================================
// BR BUFF/DEBUFF MANAGEMENT
// =============================================

function brApplyBuff(unit, stat, amount, turns) {
    unit.buffs.push({ stat, amount, turns });
    unit[stat] = (unit[stat] || 0) + amount;
}

function brRemoveExpiredBuffs(unit) {
    const expired = unit.buffs.filter(b => b.turns <= 0);
    expired.forEach(b => { unit[b.stat] = Math.max(0, (unit[b.stat] || 0) - b.amount); });
    unit.buffs = unit.buffs.filter(b => b.turns > 0);
}

function brTickBuffs(unit) {
    unit.buffs.forEach(b => b.turns--);
    brRemoveExpiredBuffs(unit);
    // Tick DoT
    let dotDmg = 0;
    unit.dotEffects = unit.dotEffects.filter(d => {
        if (d.turns > 0) { dotDmg += d.dmg; d.turns--; return d.turns > 0; }
        return false;
    });
    if (dotDmg > 0) {
        unit.hp = Math.max(0, unit.hp - dotDmg);
        brLog(`🔥 DoT: ${dotDmg} dmg!`);
    }
}

function brTickCDs(unit) {
    for (const sk in unit.cdMap) {
        if (unit.cdMap[sk] > 0) unit.cdMap[sk]--;
    }
}

// =============================================
// BR DAMAGE CALC
// =============================================

function brCalcDamage(atk, def, trueDmg) {
    if (trueDmg) return Math.max(1, atk);
    return Math.max(1, atk - Math.floor(def * 0.5));
}

function brDealDamage(tr, tc, rawAtk, trueDmg) {
    const u = brGetUnit(tr, tc);
    if (!u) return 0;
    const def = trueDmg ? 0 : u.def;
    const dmg = brCalcDamage(rawAtk, def, trueDmg);
    u.hp = Math.max(0, u.hp - dmg);
    brLog(`💢 ${dmg} dmg → [${tr},${tc}] (HP: ${u.hp}/${u.maxHp})`);
    return dmg;
}

// =============================================
// BR COMBAT LOG
// =============================================

function brLog(msg) {
    const log = gameState.br.combatLog;
    log.push(msg);
    if (log.length > 6) log.shift();
    brUpdateLog();
}

function brUpdateLog() {
    const el = document.getElementById('br-log');
    if (!el) return;
    el.innerHTML = gameState.br.combatLog.map(m => `<div class="br-log-entry">${m}</div>`).join('');
    el.scrollTop = el.scrollHeight;
}

// =============================================
// BR SKILL EXECUTION
// =============================================

function brExecuteSkill(skillId, casterR, casterC, targetR, targetC) {
    const board = gameState.currentState;
    const casterPiece = board[casterR][casterC];
    if (!casterPiece) return false;

    const unit = brGetUnit(casterR, casterC);
    if (!unit) return false;

    const skill = BR_SKILLS[casterPiece.type].find(s => s.id === skillId);
    if (!skill) return false;

    // Check mana & CD
    if (unit.mana < skill.cost) { brLog(`❌ Mana tidak cukup!`); return false; }
    if ((unit.cdMap[skillId] || 0) > 0) { brLog(`❌ Skill masih cooldown!`); return false; }

    unit.mana -= skill.cost;
    unit.cdMap[skillId] = skill.cd;

    const opp = casterPiece.color === 'white' ? 'black' : 'white';

    switch (skillId) {
        // ── PAWN SKILLS ──
        case 'P1': // Brave Strike: +2 ATK 1 turn
            brApplyBuff(unit, 'atk', 2, 1);
            brLog(`⚔ Brave Strike! +2 ATK`);
            break;
        case 'P2': // Guard Step: +2 DEF 1 turn
            brApplyBuff(unit, 'def', 2, 1);
            brLog(`🛡 Guard Step! +2 DEF`);
            break;
        case 'P3': // Last Stand: if HP≤3 → +3 ATK 1 turn
            if (unit.hp <= 3) {
                brApplyBuff(unit, 'atk', 3, 1);
                brLog(`🔥 Last Stand! +3 ATK`);
            } else {
                brLog(`❌ HP masih > 3, Last Stand gagal.`); return false;
            }
            break;

        // ── KNIGHT SKILLS ──
        case 'N1': { // Shadow Dash: extra L-move — moves the piece
            if (targetR === null) return false; // needs target
            const tr = targetR, tc = targetC;
            const dr = Math.abs(tr - casterR), dc = Math.abs(tc - casterC);
            if (!((dr===2&&dc===1)||(dr===1&&dc===2))) { brLog(`❌ Bukan L-move!`); return false; }
            if (board[tr][tc] && board[tr][tc].color === casterPiece.color) { brLog(`❌ Kotak terisi ally!`); return false; }
            if (board[tr][tc] && board[tr][tc].color === opp) {
                brDealBasicAttack(casterR, casterC, tr, tc);
            }
            brMoveUnit(casterR, casterC, tr, tc);
            board[tr][tc] = casterPiece;
            board[casterR][casterC] = null;
            brLog(`💨 Shadow Dash ke [${tr},${tc}]!`);
            break;
        }
        case 'N2': // Backstab: used when attacking — bonus +3 dmg if from behind
            brApplyBuff(unit, 'atk', 3, 1);
            brLog(`🗡 Backstab aktif! +3 ATK next attack`);
            break;
        case 'N3': { // Execute: bonus +5 dmg if target HP≤5
            if (targetR === null) return false;
            const tu = brGetUnit(targetR, targetC);
            if (!tu) { brLog(`❌ Tidak ada target!`); return false; }
            if (tu.hp > 5) { brLog(`❌ Target HP > 5, Execute gagal!`); return false; }
            brDealDamage(targetR, targetC, unit.atk + 5, true);
            brLog(`💀 Execute! +5 dmg pada [${targetR},${targetC}]`);
            brCheckUnitDeath(targetR, targetC);
            break;
        }

        // ── BISHOP SKILLS ──
        case 'B1': { // Heal: restore 4 HP to diagonal ally
            if (targetR === null) return false;
            const tu = brGetUnit(targetR, targetC);
            const tp = board[targetR][targetC];
            if (!tu || !tp || tp.color !== casterPiece.color) { brLog(`❌ Bukan ally!`); return false; }
            const dr = Math.abs(targetR - casterR), dc = Math.abs(targetC - casterC);
            if (dr !== dc || dr === 0) { brLog(`❌ Harus diagonal!`); return false; }
            const healed = Math.min(4, tu.maxHp - tu.hp);
            tu.hp = Math.min(tu.maxHp, tu.hp + 4);
            brLog(`💚 Heal +${healed} HP ke ally [${targetR},${targetC}]`);
            break;
        }
        case 'B2': { // Blessing: target ally +2 ATK 2 turns
            if (targetR === null) return false;
            const tu = brGetUnit(targetR, targetC);
            const tp = board[targetR][targetC];
            if (!tu || !tp || tp.color !== casterPiece.color) { brLog(`❌ Bukan ally!`); return false; }
            brApplyBuff(tu, 'atk', 2, 2);
            brLog(`✨ Blessing! Ally [${targetR},${targetC}] +2 ATK (2 giliran)`);
            break;
        }
        case 'B3': { // Cleanse: remove all debuffs + reset 1 CD
            if (targetR === null) return false;
            const tu = brGetUnit(targetR, targetC);
            const tp = board[targetR][targetC];
            if (!tu || !tp || tp.color !== casterPiece.color) { brLog(`❌ Bukan ally!`); return false; }
            tu.debuffs = [];
            tu.dotEffects = [];
            // Reset cheapest non-zero CD
            const cds = Object.entries(tu.cdMap).filter(([,v]) => v > 0);
            if (cds.length > 0) {
                const [sk] = cds.sort((a,b) => a[1]-b[1])[0];
                tu.cdMap[sk] = 0;
                brLog(`🌟 Cleanse! Debuff bersih + CD ${sk} reset`);
            } else {
                brLog(`🌟 Cleanse! Debuff bersih`);
            }
            break;
        }

        // ── ROOK SKILLS ──
        case 'R1': // Fortify: +3 DEF 2 turns
            brApplyBuff(unit, 'def', 3, 2);
            brLog(`🏰 Fortify! +3 DEF (2 giliran)`);
            break;
        case 'R2': { // Taunt: enemies in radius 1 must attack Rook next turn
            const br = gameState.br;
            for (let dr=-1; dr<=1; dr++) for (let dc2=-1; dc2<=1; dc2++) {
                if (!dr && !dc2) continue;
                const er = casterR+dr, ec = casterC+dc2;
                if (er<0||er>=8||ec<0||ec>=8) continue;
                const ep = board[er][ec];
                if (ep && ep.color === opp) {
                    const eu = brGetUnit(er, ec);
                    if (eu) { eu.taunted = { row: casterR, col: casterC }; }
                }
            }
            brLog(`😤 Taunt! Musuh radius 1 wajib serang Rook!`);
            break;
        }
        case 'R3': { // Ground Slam: AOE radius 1 true dmg 3
            for (let dr=-1; dr<=1; dr++) for (let dc2=-1; dc2<=1; dc2++) {
                if (!dr && !dc2) continue;
                const er = casterR+dr, ec = casterC+dc2;
                if (er<0||er>=8||ec<0||ec>=8) continue;
                const ep = board[er][ec];
                if (ep && ep.color === opp) {
                    brDealDamage(er, ec, 3, true);
                    brCheckUnitDeath(er, ec);
                }
            }
            brLog(`💥 Ground Slam! AOE 3 true dmg`);
            break;
        }

        // ── QUEEN SKILLS ──
        case 'Q1': { // Arcane Bolt: attack 2 cells straight ahead
            if (targetR === null) return false;
            // Direction from caster to target (normalized)
            const rawR2 = targetR - casterR, rawC2 = targetC - casterC;
            const nr = rawR2 === 0 ? 0 : (rawR2 > 0 ? 1 : -1);
            const nc = rawC2 === 0 ? 0 : (rawC2 > 0 ? 1 : -1);
            if ((nr === 0 && nc === 0) || (nr !== 0 && nc !== 0 && Math.abs(rawR2) !== Math.abs(rawC2))) {
                brLog(`❌ Harus lurus!`); return false;
            }
            let hits = 0;
            for (let step = 1; step <= 2; step++) {
                const er = casterR + nr*step, ec = casterC + nc*step;
                if (er<0||er>=8||ec<0||ec>=8) break;
                const ep = board[er][ec];
                if (ep && ep.color === opp) {
                    brDealDamage(er, ec, unit.atk, false);
                    brCheckUnitDeath(er, ec);
                    hits++;
                }
            }
            brLog(`🔵 Arcane Bolt! ${hits} target terkena`);
            break;
        }
        case 'Q2': { // Blink: teleport 2 cells in any direction
            if (targetR === null) return false;
            const dr = Math.abs(targetR - casterR), dc = Math.abs(targetC - casterC);
            if (dr > 2 || dc > 2) { brLog(`❌ Maks 2 kotak!`); return false; }
            if (board[targetR][targetC]) { brLog(`❌ Kotak terisi!`); return false; }
            brMoveUnit(casterR, casterC, targetR, targetC);
            board[targetR][targetC] = casterPiece;
            board[casterR][casterC] = null;
            brLog(`⚡ Blink ke [${targetR},${targetC}]!`);
            // Return special to update position tracking
            return 'moved';
        }
        case 'Q3': { // Arcane Storm: 3x3 AOE true dmg 5
            for (let dr=-1; dr<=1; dr++) for (let dc2=-1; dc2<=1; dc2++) {
                if (!dr && !dc2) continue;
                const er = casterR+dr, ec = casterC+dc2;
                if (er<0||er>=8||ec<0||ec>=8) continue;
                const ep = board[er][ec];
                if (ep && ep.color === opp) {
                    brDealDamage(er, ec, 5, true);
                    brCheckUnitDeath(er, ec);
                }
            }
            brLog(`🌀 Arcane Storm! AOE 3×3 5 true dmg`);
            break;
        }

        // ── KING SKILLS ──
        case 'K1': { // Royal Guard: ally radius 1 +2 DEF 1 turn
            for (let dr=-1; dr<=1; dr++) for (let dc2=-1; dc2<=1; dc2++) {
                if (!dr && !dc2) continue;
                const er = casterR+dr, ec = casterC+dc2;
                if (er<0||er>=8||ec<0||ec>=8) continue;
                const ep = board[er][ec];
                if (ep && ep.color === casterPiece.color) {
                    const eu = brGetUnit(er, ec);
                    if (eu) brApplyBuff(eu, 'def', 2, 1);
                }
            }
            brLog(`👑 Royal Guard! Radius 1 +2 DEF`);
            break;
        }
        case 'K2': { // Inspire: all ally Pawns +1 ATK 2 turns
            for (let r=0; r<8; r++) for (let c=0; c<8; c++) {
                const ep = board[r][c];
                if (ep && ep.color === casterPiece.color && ep.type === 'P') {
                    const eu = brGetUnit(r, c);
                    if (eu) brApplyBuff(eu, 'atk', 1, 2);
                }
            }
            brLog(`📯 Inspire! Semua Pion +1 ATK (2 giliran)`);
            break;
        }
        case 'K3': { // Final Stand: if HP≤10, all allies +2 ATK 1 turn
            if (unit.hp > 10) { brLog(`❌ HP masih > 10!`); return false; }
            for (let r=0; r<8; r++) for (let c=0; c<8; c++) {
                const ep = board[r][c];
                if (ep && ep.color === casterPiece.color) {
                    const eu = brGetUnit(r, c);
                    if (eu) brApplyBuff(eu, 'atk', 2, 1);
                }
            }
            brLog(`⚔ Final Stand! Semua ally +2 ATK!`);
            break;
        }
        default:
            return false;
    }
    return true;
}

// =============================================
// BR SPELL EXECUTION
// =============================================

function brExecuteSpell(spellId, player, targetR, targetC) {
    const board = gameState.currentState;
    const spellState = gameState.br.spells[player];
    const spell = BR_SPELLS.find(s => s.id === spellId);
    if (!spell) return false;

    if (spellState.energy < spell.energy) { brLog(`❌ Spell Energy tidak cukup!`); return false; }
    if ((spellState.cd[spellId] || 0) > 0) { brLog(`❌ Spell cooldown!`); return false; }

    const opp = player === 'white' ? 'black' : 'white';
    spellState.energy -= spell.energy;

    switch (spellId) {
        case 'SP_FLICKER': { // Teleport 2 cells
            if (targetR === null) return false;
            // Find King of current player to teleport
            let kr=-1, kc=-1;
            outer: for (let r=0; r<8; r++) for (let c=0; c<8; c++) {
                const p = board[r][c];
                if (p && p.type==='K' && p.color===player) { kr=r; kc=c; break outer; }
            }
            if (kr<0 || board[targetR][targetC]) { brLog(`❌ Target kotak terisi!`); spellState.energy += spell.energy; return false; }
            brMoveUnit(kr, kc, targetR, targetC);
            board[targetR][targetC] = board[kr][kc];
            board[kr][kc] = null;
            brLog(`⚡ Flicker! Raja ke [${targetR},${targetC}]`);
            break;
        }
        case 'SP_EXECUTE': { // Instant kill HP≤4
            if (targetR === null) return false;
            const tp = board[targetR][targetC];
            const tu = brGetUnit(targetR, targetC);
            if (!tp || !tu || tp.color !== opp) { brLog(`❌ Bukan musuh!`); spellState.energy += spell.energy; return false; }
            if (tu.hp > 4) { brLog(`❌ HP target > 4!`); spellState.energy += spell.energy; return false; }
            tu.hp = 0;
            brCheckUnitDeath(targetR, targetC);
            brLog(`💀 Execute! Unit [${targetR},${targetC}] terbunuh!`);
            break;
        }
        case 'SP_AEGIS': { // Shield 5 HP to ally
            if (targetR === null) return false;
            const tp = board[targetR][targetC];
            const tu = brGetUnit(targetR, targetC);
            if (!tp || !tu || tp.color !== player) { brLog(`❌ Bukan ally!`); spellState.energy += spell.energy; return false; }
            tu.hp = Math.min(tu.maxHp + 5, tu.hp + 5); // temp shield as bonus HP
            brLog(`🛡 Aegis! +5 HP ke ally [${targetR},${targetC}]`);
            break;
        }
        case 'SP_RETRIB': { // 3 true dmg
            if (targetR === null) return false;
            const tp = board[targetR][targetC];
            if (!tp || tp.color !== opp) { brLog(`❌ Bukan musuh!`); spellState.energy += spell.energy; return false; }
            brDealDamage(targetR, targetC, 3, true);
            brCheckUnitDeath(targetR, targetC);
            brLog(`🔥 Retribution! 3 true dmg ke [${targetR},${targetC}]`);
            break;
        }
        case 'SP_BARRIER': { // +3 DEF ally 2 turns
            if (targetR === null) return false;
            const tp = board[targetR][targetC];
            const tu = brGetUnit(targetR, targetC);
            if (!tp || !tu || tp.color !== player) { brLog(`❌ Bukan ally!`); spellState.energy += spell.energy; return false; }
            brApplyBuff(tu, 'def', 3, 2);
            brLog(`🔷 Barrier! +3 DEF ally [${targetR},${targetC}] (2 giliran)`);
            break;
        }
        case 'SP_IGNITE': { // DoT 2 dmg for 2 turns
            if (targetR === null) return false;
            const tp = board[targetR][targetC];
            const tu = brGetUnit(targetR, targetC);
            if (!tp || !tu || tp.color !== opp) { brLog(`❌ Bukan musuh!`); spellState.energy += spell.energy; return false; }
            tu.dotEffects.push({ dmg: 2, turns: 2 });
            brLog(`🌋 Ignite! DoT 2 dmg/giliran ke [${targetR},${targetC}]`);
            break;
        }
        default:
            return false;
    }

    spellState.cd[spellId] = 3;
    return true;
}

// =============================================
// BR BASIC ATTACK
// =============================================

function brDealBasicAttack(fr, fc, tr, tc) {
    const board = gameState.currentState;
    const u = brGetUnit(fr, fc);
    const tu = brGetUnit(tr, tc);
    if (!u || !tu) return false;
    const tp = board[tr][tc];
    const fp = board[fr][fc];
    if (!tp || !fp) return false;
    if (tp.color === fp.color) return false;

    const dmg = brDealDamage(tr, tc, u.atk, false);
    brLog(`${PIECE_SYMBOLS[fp.color][fp.type]} basic attack → ${dmg} dmg`);
    brCheckUnitDeath(tr, tc);
    return true;
}

// =============================================
// BR DEATH CHECK
// =============================================

function brCheckUnitDeath(r, c) {
    const u = brGetUnit(r, c);
    const board = gameState.currentState;
    const p = board[r][c];
    if (!u || !p) return;
    if (u.hp > 0) return;

    brLog(`💀 ${PIECE_SYMBOLS[p.color][p.type]} di [${r},${c}] mati!`);

    // Check if it's a King
    if (p.type === 'K') {
        brDelUnit(r, c);
        board[r][c] = null;
        renderBoard();
        brUpdateHUD();
        setTimeout(() => showGameOver(p.color === 'white' ? 'black' : 'white'), 800);
        gameState.gameOver = true;
        return;
    }

    brDelUnit(r, c);
    board[r][c] = null;
}

// =============================================
// BR SUDDEN DEATH
// =============================================

function brApplySuddenDeath() {
    const board = gameState.currentState;
    for (let r=0; r<8; r++) for (let c=0; c<8; c++) {
        const p = board[r][c];
        const u = brGetUnit(r, c);
        if (!p || !u) continue;
        u.hp = Math.max(0, u.hp - 2);
        if (u.hp <= 0) brCheckUnitDeath(r, c);
    }
    brLog(`☠ SUDDEN DEATH! Semua unit -2 HP!`);
}

// =============================================
// BR TURN START (tick buffs, regen mana/energy)
// =============================================

function brOnTurnStart(color) {
    const board = gameState.currentState;
    const br = gameState.br;

    // Regen spell energy +1
    const sp = br.spells[color];
    sp.energy = Math.min(10, sp.energy + 1);

    // Tick all units on board
    for (let r=0; r<8; r++) for (let c=0; c<8; c++) {
        const p = board[r][c];
        if (!p || p.color !== color) continue;
        const u = brGetUnit(r, c);
        if (!u) continue;
        brTickBuffs(u);
        brTickCDs(u);
        // Tick spell CDs
        for (const sp2 in br.spells[color].cd) {
            if (br.spells[color].cd[sp2] > 0) br.spells[color].cd[sp2]--;
        }
    }

    // Sudden death
    br.turnCount++;
    if (br.turnCount >= BR_SUDDEN_DEATH_TURN) brApplySuddenDeath();
}

// =============================================
// BR MANA REGEN ON SELECT
// =============================================

function brRegenManaOnSelect(r, c) {
    const u = brGetUnit(r, c);
    if (!u) return;
    u.mana = Math.min(u.maxMana, u.mana + 1);
}

// =============================================
// BR HUD RENDERING
// =============================================

function brUpdateHUD() {
    const br = gameState.br;
    if (!br) return;
    const player = gameState.currentPlayer;
    const board = gameState.currentState;
    const turn = br.turn;

    // Update info bar
    const infoEl = document.getElementById('br-info');
    if (infoEl) {
        const phase = turn.phase;
        let phaseText = '';
        if (phase === 'select') phaseText = '🎯 Pilih bidak';
        else if (phase === 'moved') phaseText = '✅ Sudah pindah — pilih skill / end turn';
        else if (phase === 'skill-target') phaseText = '🎯 Pilih target skill';
        else if (phase === 'spell-target') phaseText = '🎯 Pilih target spell';
        else if (phase === 'basic-target') phaseText = '🎯 Pilih target serang';
        else if (phase === 'done') phaseText = '⏳ Turn selesai';

        const sudStr = br.turnCount >= BR_SUDDEN_DEATH_TURN ? ' <span style="color:#FF4560">☠ SUDDEN DEATH!</span>' : ` Turn ${br.turnCount}/${BR_SUDDEN_DEATH_TURN}`;
        infoEl.innerHTML = `${phaseText}${sudStr}`;
    }

    // Update action buttons
    brUpdateActionPanel();

    // Update selected piece panel
    const sel = turn.selectedPiece;
    const statEl = document.getElementById('br-stats');
    if (statEl) {
        if (sel) {
            const p = board[sel.row][sel.col];
            const u = brGetUnit(sel.row, sel.col);
            if (p && u) {
                const skills = BR_SKILLS[p.type] || [];
                let skillsHtml = skills.map(sk => {
                    const onCd = (u.cdMap[sk.id] || 0) > 0;
                    const noMana = u.mana < sk.cost;
                    const disabled = onCd || noMana;
                    const cdStr = onCd ? ` CD:${u.cdMap[sk.id]}` : '';
                    return `<button class="br-skill-btn${disabled?' disabled':''}" onclick="brOnSkillClick('${sk.id}')" title="${sk.desc}">
                        ${sk.icon} ${sk.name} (${sk.cost}💎${cdStr})
                    </button>`;
                }).join('');
                statEl.innerHTML = `
                    <div class="br-unit-header">${PIECE_SYMBOLS[p.color][p.type]} ${BR_STATS[p.type].name}</div>
                    <div class="br-unit-stats">
                        <span>❤ ${u.hp}/${u.maxHp}</span>
                        <span>⚔ ${u.atk}</span>
                        <span>🛡 ${u.def}</span>
                        <span>💎 ${u.mana}/${u.maxMana}</span>
                    </div>
                    <div class="br-skills">${skillsHtml}</div>
                `;
            } else {
                statEl.innerHTML = '';
            }
        } else {
            statEl.innerHTML = '<div class="br-unit-hint">Klik bidak untuk info</div>';
        }
    }

    // Update spell panel
    const spellEl = document.getElementById('br-spells');
    if (spellEl) {
        const sp = br.spells[player];
        const html = sp.selected.map(sid => {
            const spell = BR_SPELLS.find(s => s.id === sid);
            if (!spell) return '';
            const onCd = (sp.cd[sid] || 0) > 0;
            const noE = sp.energy < spell.energy;
            const used = br.turn.spellUsed;
            const disabled = onCd || noE || used;
            const cdStr = onCd ? ` CD:${sp.cd[sid]}` : '';
            return `<button class="br-spell-btn${disabled?' disabled':''}" onclick="brOnSpellClick('${sid}')" title="${spell.desc}">
                ${spell.icon} ${spell.name} (${spell.energy}⚡${cdStr})
            </button>`;
        }).join('');
        spellEl.innerHTML = `<div class="br-spell-energy">⚡ ${sp.energy}/10</div>${html}`;
    }
}

function brUpdateActionPanel() {
    const turn = gameState.br.turn;
    const phase = turn.phase;
    const panel = document.getElementById('br-actions');
    if (!panel) return;

    let html = '';

    if (phase === 'select') {
        html = `<div class="br-action-hint">Pilih bidak → pindah atau serang</div>`;
    } else if (phase === 'moved') {
        html = `
            <button class="br-act-btn" onclick="brStartBasicAttack()">⚔ Basic Attack</button>
            <button class="br-act-btn btn-end" onclick="brEndTurn()">⏭ End Turn</button>
        `;
    } else if (phase === 'skill-target' || phase === 'spell-target' || phase === 'basic-target') {
        html = `
            <div class="br-action-hint">🎯 Klik target di papan</div>
            <button class="br-act-btn btn-cancel" onclick="brCancelTarget()">✕ Batal</button>
        `;
    } else if (phase === 'done') {
        html = `<button class="br-act-btn btn-end" onclick="brEndTurn()">⏭ End Turn</button>`;
    }

    // End turn always available except in select & target phases
    if (phase === 'select') {
        html += `<button class="br-act-btn btn-end" onclick="brEndTurn()">⏭ Skip Turn</button>`;
    }

    panel.innerHTML = html;
}

// =============================================
// BR CELL CLICK HANDLER
// =============================================

function brOnCellClick(r, c) {
    if (gameState.gameOver) return;
    const br = gameState.br;
    const board = gameState.currentState;
    const player = gameState.currentPlayer;
    const turn = br.turn;
    const piece = board[r][c];

    // ── PHASE: skill-target ──
    if (turn.phase === 'skill-target') {
        brHandleSkillTarget(r, c);
        return;
    }

    // ── PHASE: spell-target ──
    if (turn.phase === 'spell-target') {
        brHandleSpellTarget(r, c);
        return;
    }

    // ── PHASE: basic-target ──
    if (turn.phase === 'basic-target') {
        brHandleBasicTarget(r, c);
        return;
    }

    // ── PHASE: select / moved (re-selecting move destination) ──
    // If a move target is highlighted and clicked
    if (turn.phase === 'select' || turn.phase === 'moved') {
        const sel = turn.selectedPiece;

        // Clicking a valid move square
        if (sel && turn.phase === 'select') {
            const inMoves = gameState.validMoves.find(m => m.row === r && m.col === c);
            if (inMoves) {
                brDoMove(sel.row, sel.col, r, c);
                return;
            }
        }

        // Clicking own piece to select
        if (piece && piece.color === player) {
            // Re-select only allowed in 'select' phase
            if (turn.phase !== 'select') { brLog(`❌ Sudah pindah!`); return; }
            brSelectPiece(r, c);
            return;
        }
    }
}

function brSelectPiece(r, c) {
    const board = gameState.currentState;
    const p = board[r][c];
    if (!p) return;
    gameState.br.turn.selectedPiece = { row: r, col: c };
    gameState.selectedCell = { row: r, col: c };
    gameState.validMoves = getValidMoves(board, r, c, 8, 8);
    // Mana regen on select
    brRegenManaOnSelect(r, c);
    brUpdateHUD();
    renderBoard();
}

// =============================================
// BR MOVE
// =============================================

function brDoMove(fr, fc, tr, tc) {
    const board = gameState.currentState;
    const br = gameState.br;
    const p = board[fr][fc];
    if (!p) return;

    // If destination has enemy — this is a capture attempt (NOT auto-attack)
    const target = board[tr][tc];
    if (target && target.color !== p.color) {
        // Moving INTO enemy square: just a positional move, doesn't auto-attack
        // Player must use basic attack or skill to damage
        // Actually: we allow move into enemy square as engagement (standard chess move)
        // But in BR mode: occupying enemy square = basic attack automatically
        brDealBasicAttack(fr, fc, tr, tc);
        if (!board[tr][tc] || board[tr][tc].hp <= 0) {
            // Enemy died, move in
        } else {
            // Enemy alive: attacker can't enter, stays
            brLog(`${PIECE_SYMBOLS[p.color][p.type]} menyerang tapi musuh bertahan!`);
            brMoveUnit(fr, fc, fr, fc); // stays
            br.turn.phase = 'moved';
            br.turn.movedTo = { row: fr, col: fc };
            br.turn.basicAttacked = true;
            renderBoard();
            brUpdateHUD();
            return;
        }
    }

    // Execute move
    board[tr][tc] = p;
    board[fr][fc] = null;
    brMoveUnit(fr, fc, tr, tc);

    gameState.lastMove = { from: { row: fr, col: fc }, to: { row: tr, col: tc } };
    gameState.selectedCell = null;
    gameState.validMoves = [];

    br.turn.phase = 'moved';
    br.turn.movedTo = { row: tr, col: tc };
    br.turn.selectedPiece = { row: tr, col: tc };

    // Pawn promotion
    if (p.type === 'P') {
        if (p.color === 'white' && tr === 0) {
            board[tr][tc] = mkPiece('Q', 'white');
            const u = brGetUnit(tr, tc);
            if (u) { u.hp = Math.min(u.maxHp + 2, u.hp + 2); u.maxHp += 2; u.atk += 1; }
            brLog(`👑 Promosi Pion menjadi Ratu!`);
        }
        if (p.color === 'black' && tr === 7) {
            board[tr][tc] = mkPiece('Q', 'black');
            const u = brGetUnit(tr, tc);
            if (u) { u.hp = Math.min(u.maxHp + 2, u.hp + 2); u.maxHp += 2; u.atk += 1; }
            brLog(`👑 Promosi Pion menjadi Ratu!`);
        }
    }

    brUpdateHUD();
    renderBoard();
    animatePieceMove(tr, tc);
}

// =============================================
// BR SKILL CLICK
// =============================================

function brOnSkillClick(skillId) {
    const br = gameState.br;
    const turn = br.turn;
    if (turn.phase !== 'moved' && turn.phase !== 'select') { brLog(`❌ Skill hanya setelah pindah!`); return; }
    if (turn.skillUsed) { brLog(`❌ Sudah pakai skill!`); return; }
    if (!turn.selectedPiece) { brLog(`❌ Pilih bidak dulu!`); return; }

    // Skills that need a target: N1, N3, B1, B2, B3, Q1, Q2
    const needsTarget = ['N1','N3','B1','B2','B3','Q1','Q2'];
    if (needsTarget.includes(skillId)) {
        turn.pendingSkill = skillId;
        turn.phase = 'skill-target';
        brLog(`🎯 Pilih target untuk ${skillId}`);
        brUpdateHUD();
        renderBoard();
        return;
    }

    // Self skills: P1, P2, P3, N2, R1, R2, R3, K1, K2, K3
    const sel = turn.selectedPiece;
    const result = brExecuteSkill(skillId, sel.row, sel.col, null, null);
    if (result) {
        turn.skillUsed = true;
        turn.phase = turn.phase === 'select' ? 'select' : 'done';
    }
    brUpdateHUD();
    renderBoard();
}

function brHandleSkillTarget(r, c) {
    const br = gameState.br;
    const turn = br.turn;
    const sel = turn.selectedPiece;
    if (!sel || !turn.pendingSkill) return;

    const result = brExecuteSkill(turn.pendingSkill, sel.row, sel.col, r, c);

    if (result) {
        turn.skillUsed = true;
        turn.phase = 'done';
        // If skill moved the caster (Blink, Shadow Dash)
        if (result === 'moved') {
            turn.selectedPiece = { row: r, col: c };
            turn.movedTo = { row: r, col: c };
        }
    } else {
        turn.phase = turn.movedTo ? 'moved' : 'select';
    }
    turn.pendingSkill = null;
    brUpdateHUD();
    renderBoard();
}

// =============================================
// BR SPELL CLICK
// =============================================

function brOnSpellClick(spellId) {
    const br = gameState.br;
    const turn = br.turn;
    const player = gameState.currentPlayer;

    if (turn.spellUsed) { brLog(`❌ Sudah pakai spell!`); return; }

    // All spells need a target
    const needsTarget = ['SP_FLICKER','SP_EXECUTE','SP_AEGIS','SP_RETRIB','SP_BARRIER','SP_IGNITE'];
    if (needsTarget.includes(spellId)) {
        turn.pendingSpell = spellId;
        turn.phase = 'spell-target';
        brLog(`🎯 Pilih target spell ${spellId}`);
        brUpdateHUD();
        renderBoard();
        return;
    }

    const result = brExecuteSpell(spellId, player, null, null);
    if (result) {
        turn.spellUsed = true;
        turn.phase = 'done';
    }
    brUpdateHUD();
    renderBoard();
}

function brHandleSpellTarget(r, c) {
    const br = gameState.br;
    const turn = br.turn;
    const player = gameState.currentPlayer;
    if (!turn.pendingSpell) return;

    const result = brExecuteSpell(turn.pendingSpell, player, r, c);
    if (result) {
        turn.spellUsed = true;
        turn.phase = turn.movedTo ? 'done' : 'select';
    } else {
        turn.phase = turn.movedTo ? 'moved' : 'select';
    }
    turn.pendingSpell = null;
    brUpdateHUD();
    renderBoard();
}

// =============================================
// BR BASIC ATTACK BUTTON
// =============================================

function brStartBasicAttack() {
    const br = gameState.br;
    const turn = br.turn;
    if (turn.basicAttacked) { brLog(`❌ Sudah basic attack!`); return; }
    if (!turn.selectedPiece) { brLog(`❌ Pilih bidak dulu!`); return; }
    turn.phase = 'basic-target';
    brLog(`⚔ Pilih target basic attack`);
    brUpdateHUD();
    renderBoard();
}

function brHandleBasicTarget(r, c) {
    const br = gameState.br;
    const turn = br.turn;
    const board = gameState.currentState;
    const player = gameState.currentPlayer;
    const sel = turn.selectedPiece;
    if (!sel) return;

    const tp = board[r][c];
    if (!tp || tp.color === player) {
        brLog(`❌ Pilih musuh!`);
        turn.phase = 'moved';
        brUpdateHUD();
        return;
    }

    brDealBasicAttack(sel.row, sel.col, r, c);
    turn.basicAttacked = true;
    turn.phase = 'done';
    brUpdateHUD();
    renderBoard();
}

// =============================================
// BR CANCEL TARGET
// =============================================

function brCancelTarget() {
    const br = gameState.br;
    const turn = br.turn;
    turn.pendingSkill = null;
    turn.pendingSpell = null;
    turn.phase = turn.movedTo ? 'moved' : 'select';
    brUpdateHUD();
    renderBoard();
}

// =============================================
// BR END TURN
// =============================================

function brEndTurn() {
    const br = gameState.br;
    if (gameState.gameOver) return;

    // Reset turn state
    br.turn = {
        phase: 'select',
        selectedPiece: null,
        movedTo: null,
        skillUsed: false,
        spellUsed: false,
        basicAttacked: false,
        pendingSkill: null,
        pendingSpell: null,
        actionDone: false,
    };

    gameState.selectedCell = null;
    gameState.validMoves = [];
    gameState.lastMove = null;

    // Switch player
    gameState.currentPlayer = gameState.currentPlayer === 'white' ? 'black' : 'white';
    updateTurnIndicator();

    // On turn start: tick buffs, regen
    brOnTurnStart(gameState.currentPlayer);

    brLog(`— Giliran ${gameState.currentPlayer === 'white' ? 'PUTIH ♔' : 'HITAM ♚'} —`);
    brUpdateHUD();
    renderBoard();
}

// =============================================
// BR SPELL SETUP SCREEN LOGIC
// =============================================

function brShowSpellSetup() {
    const br = gameState.br;
    const player = br.setupPlayer;
    document.getElementById('br-setup-player').textContent =
        player === 'white' ? 'PUTIH ♔' : 'HITAM ♚';
    document.getElementById('br-setup-player').style.color =
        player === 'white' ? 'var(--highlight)' : '#7ECBF0';

    const container = document.getElementById('br-spell-choices');
    container.innerHTML = BR_SPELLS.map(s => {
        const selected = (player === 'white' ? br.whiteSpells : br.blackSpells).includes(s.id);
        return `<button class="br-spell-choice${selected?' selected':''}" onclick="brToggleSpell('${s.id}')">
            <span class="bsc-icon">${s.icon}</span>
            <div class="bsc-info">
                <span class="bsc-name">${s.name}</span>
                <span class="bsc-cost">${s.energy}⚡</span>
                <span class="bsc-desc">${s.desc}</span>
            </div>
        </button>`;
    }).join('');

    showScreen('screen-br-setup');
}

function brToggleSpell(spellId) {
    const br = gameState.br;
    const player = br.setupPlayer;
    const arr = player === 'white' ? br.whiteSpells : br.blackSpells;
    const idx = arr.indexOf(spellId);
    if (idx >= 0) {
        arr.splice(idx, 1);
    } else {
        if (arr.length >= 2) arr.shift();
        arr.push(spellId);
    }
    brShowSpellSetup();
}

function brConfirmSpells() {
    const br = gameState.br;
    const player = br.setupPlayer;
    const arr = player === 'white' ? br.whiteSpells : br.blackSpells;
    if (arr.length !== 2) {
        alert('Pilih tepat 2 spell!'); return;
    }
    br.spells[player].selected = [...arr];

    if (player === 'white') {
        br.setupPlayer = 'black';
        brShowSpellSetup();
    } else {
        // Both done → start game
        br.setupPhase = false;
        startGame('battleroyale');
    }
}

// =============================================
// BR RENDER OVERLAY (HP bars etc on board)
// =============================================

function brRenderCellOverlay(cellEl, r, c) {
    const u = brGetUnit(r, c);
    const p = gameState.currentState[r][c];
    if (!u || !p) return;

    const pct = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100));
    const bar = document.createElement('div');
    bar.className = 'br-hp-bar';
    const fill = document.createElement('div');
    fill.className = 'br-hp-fill';
    fill.style.width = pct + '%';
    fill.style.background = pct > 60 ? '#00FF88' : pct > 30 ? '#FFB700' : '#FF4560';
    bar.appendChild(fill);

    const manaBar = document.createElement('div');
    manaBar.className = 'br-mana-bar';
    const manaFill = document.createElement('div');
    manaFill.className = 'br-mana-fill';
    manaFill.style.width = (u.mana / u.maxMana * 100) + '%';
    manaBar.appendChild(manaFill);

    const hpText = document.createElement('div');
    hpText.className = 'br-hp-text';
    hpText.textContent = u.hp;

    cellEl.appendChild(bar);
    cellEl.appendChild(manaBar);
    cellEl.appendChild(hpText);
}

// =============================================
// BR INIT GAME HOOK
// =============================================

function brInitGame() {
    const board = gameState.currentState;
    brInit(board);
    brOnTurnStart('white');
    brLog('⚔ BATTLE ROYALE dimulai!');
    brLog('💡 Pilih bidak → pindah → skill/serang');
    brUpdateHUD();
}

// =============================================
// EXPORTS / HOOKS INTO MAIN ENGINE
// =============================================

// Patch onCellClick to route BR clicks
const _origOnCellClick = window.onCellClick;
document.addEventListener('DOMContentLoaded', () => {
    // We'll patch renderBoard to add BR overlays
    const _origRenderBoard = window.renderBoard;
});
