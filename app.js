/* Halloween Snap v1.01 — static Github Pages + Supabase.
   Public browser config only. Never embed a service-role key. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.HALLOWEEN_SNAP_CONFIG || {};
  const ready = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && /^https:\/\//.test(cfg.supabaseUrl) && !cfg.supabaseUrl.includes('YOUR-'));
  const FILTERS = [
    {id:'none',label:'Original',css:'none',icon:'◯'},
    {id:'pumpkin',label:'Pumpkin',css:'sepia(.28) saturate(1.55) contrast(1.1) brightness(1.04)',icon:'🎃'},
    {id:'vampire',label:'Vampire',css:'sepia(.48) saturate(1.75) hue-rotate(-22deg) contrast(1.22)',icon:'🦇'},
    {id:'witch',label:'Witching',css:'sepia(.23) hue-rotate(65deg) saturate(1.48) contrast(1.1)',icon:'🔮'},
    {id:'ghost',label:'Ghost',css:'grayscale(.75) brightness(1.2) contrast(.92)',icon:'👻'},
    {id:'candy',label:'Candy',css:'saturate(1.9) sepia(.12) brightness(1.1)',icon:'🍬'},
    {id:'graveyard',label:'Graveyard',css:'sepia(.35) hue-rotate(105deg) saturate(.83) contrast(1.28)',icon:'🪦'},
    {id:'noir',label:'Midnight',css:'grayscale(1) contrast(1.35)',icon:'🌙'}
  ];
  const VIDEO_UPLOAD_MAX_SECONDS = 300; // Snapchat imported-video limit
  const VIDEO_RECORD_MAX_SECONDS = 180; // Snapchat camera video limit
  const VIDEO_MAX_BYTES = 50*1024*1024; // Supabase Free storage object cap
  const FRAMES = [{id:'none',label:'No frame',icon:'◯'},{id:'bats',label:'🦇 Bats'},{id:'web',label:'🕸 Webs'},{id:'pumpkins',label:'🎃 Pumpkins'},{id:'ghosts',label:'👻 Ghosts'}];
  const THEMES = [
    {id:'haunted',label:'Haunted After Dark',description:'Electric moonlight',background:'linear-gradient(135deg,#151421 55%,#d5f76f)'},
    {id:'pumpkin',label:'Pumpkin Fever',description:'Orange everything',background:'linear-gradient(135deg,#291a21 55%,#ff9a42)'},
    {id:'coven',label:'Violet Coven',description:'Witchy purple haze',background:'linear-gradient(135deg,#251a38 55%,#ed9cff)'},
    {id:'slime',label:'Toxic Slime',description:'Monstrously green',background:'linear-gradient(135deg,#132821 55%,#a3fa68)'}
  ];
  const state = {
    db:null,user:null,party:null,me:null,members:[],photos:[],likes:[],signed:new Map(),
    channel:null,poll:null,loading:false,demo:false,demoSealed:[],pending:{count:0,next:null},composer:{file:null,url:null,img:null,video:null,kind:'image',duration:0,filter:'none',frame:'none',stream:null,facing:'environment',busy:false,recorder:null,recordTimer:null,recordStarted:0,cameraMode:'image',cancelRecording:false},
    accessMode:'create',viewIds:[],viewIndex:0,localTheme:null
  };
  const escapeHTML = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initial = v => (String(v||'G').trim().charAt(0)||'G').toUpperCase();
  const dateLabel = value => { const d = new Date(value); return Number.isNaN(d.getTime())?'':d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); };
  const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
  let toastTimer, refreshTimer;

  function toast(message) {
    const node = $('toast'); node.textContent=message; node.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,3800);
  }
  function showModal(name) {
    $(name+'-modal').hidden=false;
    document.body.style.overflow='hidden';
  }
  async function hideModal(name) {
    $(name+'-modal').hidden=true;
    if (name==='composer') { await stopCamera(); clearComposer(); }
    if (name==='viewer') { $('viewer-video').pause(); $('viewer-video').removeAttribute('src'); $('viewer-video').load(); }
    if (!Array.from(document.querySelectorAll('.modal')).some(el=>!el.hidden)) document.body.style.overflow='';
  }
  function stopLive() {
    if(state.channel && state.db)state.db.removeChannel(state.channel);
    state.channel=null;
    if(state.poll)clearInterval(state.poll);state.poll=null;
    clearTimeout(refreshTimer);
  }
  function partyLink(code) {
    const url=new URL(window.location.href);
    url.searchParams.set('party',code);url.hash='';return url.toString();
  }
  function setPartyUrl(code) {
    const url=new URL(window.location.href);
    if(code)url.searchParams.set('party',code);else url.searchParams.delete('party');
    window.history.replaceState({},'',url.toString());
  }
  function applyTheme(theme) {
    if(!THEMES.some(t=>t.id===theme))theme='haunted';
    document.body.dataset.theme=theme;
    document.querySelector('meta[name="theme-color"]').content=getComputedStyle(document.body).getPropertyValue('--bg').trim()||'#10111c';
    renderThemes();
  }
  function setLocalTheme(theme) {
    state.localTheme=theme;
    if(state.party) localStorage.setItem('halloween_snap_theme_'+state.party.id,theme);
    applyTheme(theme);
  }
  function renderThemes() {
    const container=$('theme-tiles');
    if(!container)return;
    const current=document.body.dataset.theme;
    container.innerHTML=THEMES.map(t=>`<button type="button" class="theme-tile ${current===t.id?'active':''}" data-theme-choice="${t.id}"><div class="theme-swatch" style="background:${t.background}"></div><b>${t.label}</b><small>${t.description}</small></button>`).join('');
    $('set-party-theme').hidden=!(state.party && !state.demo && state.user && state.party.owner_id===state.user.id);
    $('use-party-theme').hidden=!state.party;
  }

  function showAccess(mode,code='') {
    state.accessMode=mode;
    $('access-heading').textContent=mode==='create'?'START YOUR HAUNT':'JOIN THE PARTY';
    $('access-help').textContent=mode==='create'?'Make a photo room for everyone to share.':'Your friends are already making memories. Get in on it.';
    $('room-name-label').hidden=mode!=='create';
    $('join-code-label').hidden=mode!=='join';
    $('starting-theme-label').hidden=mode!=='create';
    $('access-submit').textContent=mode==='create'?'Create my party ↗':'Let me in ↗';
    $('access-error').hidden=true;
    $('join-code').value=code;
    $('guest-name').value=localStorage.getItem('halloween_snap_name')||'';
    showModal('access');
    setTimeout(()=>{if(mode==='join'&&!code)$('join-code').focus();else if(!$('guest-name').value)$('guest-name').focus();},100);
  }
  async function ensureAuth() {
    if(!ready)throw new Error('First connect Supabase in config.js. The ZIP README walks you through it.');
    if(!window.supabase?.createClient)throw new Error('Supabase library did not load. Check your internet connection or content blocker.');
    if(!state.db)state.db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
    if(!state.user){
      const {data,error}=await state.db.auth.getUser();
      if(!error&&data?.user)state.user=data.user;
      else {
        const answer=await state.db.auth.signInAnonymously();
        if(answer.error)throw new Error('Anonymous sign-in failed. Enable Anonymous Sign-Ins in Supabase Auth. '+answer.error.message);
        state.user=answer.data.user;
      }
    }
    return state.user;
  }
  async function submitAccess(event) {
    event.preventDefault();
    const name=$('guest-name').value.trim();
    const err=$('access-error');err.hidden=true;
    if(!name||name.length>30){err.textContent='Enter a name (up to 30 characters).';err.hidden=false;return;}
    const submit=$('access-submit');submit.disabled=true;
    try {
      await ensureAuth();
      let response;
      if(state.accessMode==='create') {
        const title=$('room-name').value.trim();if(!title)throw new Error('Give your Halloween party a name.');
        response=await state.db.rpc('halloween_create_party',{p_title:title,p_name:name,p_theme:$('starting-theme').value});
      } else {
        const code=$('join-code').value.trim().toLowerCase();
        if(!code)throw new Error('Enter the invite code from your friend.');
        response=await state.db.rpc('halloween_join_party',{p_code:code,p_name:name});
      }
      if(response.error)throw response.error;
      if(!response.data?.length)throw new Error('No party was returned by the database.');
      const {party_id,party_code}=response.data[0];
      localStorage.setItem('halloween_snap_name',name);
      await openParty(party_id,party_code);
      await hideModal('access');
      toast(state.party?.owner_id===state.user.id?'Your party is ready! Share the invite link.':'You’re in! Time to make memories.');
      if(state.accessMode==='create')showShare();
    } catch(e) {err.textContent=e.message||'Could not join the party.';err.hidden=false;}
    finally{submit.disabled=false;}
  }

  async function openParty(id,code) {
    if(!state.db)throw new Error('Database is not connected.');
    const [{data:room,error:roomError},{data:me,error:meError}]=await Promise.all([
      state.db.from('halloween_rooms').select('*').eq('id',id).single(),
      state.db.from('halloween_members').select('*').eq('room_id',id).eq('user_id',state.user.id).single()
    ]);
    if(roomError)throw roomError;if(meError)throw meError;
    stopLive();state.demo=false;state.party=room;state.me=me;
    state.photos=[];state.likes=[];state.members=[];state.pending={count:0,next:null};state.demoSealed=[];state.signed.clear();
    state.localTheme=localStorage.getItem('halloween_snap_theme_'+id);
    applyTheme(state.localTheme||room.theme);
    setPartyUrl(code||room.code);
    showPartyView();
    await refreshAll();
    subscribeParty(id);
  }
  function showPartyView() {
    $('landing-view').hidden=true;$('party-view').hidden=false;
    $('party-title').textContent=state.party?.title||'THE HAUNT';
    $('top-invite').hidden=false;
    $('mobile-bar').hidden=false;
    $('demo-indicator').hidden=!state.demo;
    $('demo-note').hidden=!state.demo;
    $('party-tag').textContent=state.demo?'// THE PREVIEW':'// INVITE ONLY';
    window.scrollTo({top:0,behavior:'instant'});
    renderThemes();
  }
  function goHome() {
    stopLive();if(state.demo&&state.user?.id==='demo-user')state.user=null;state.party=null;state.me=null;state.photos=[];state.likes=[];state.members=[];state.pending={count:0,next:null};state.demoSealed=[];state.demo=false;state.signed.clear();
    setPartyUrl(null);$('landing-view').hidden=false;$('party-view').hidden=true;
    $('top-invite').hidden=true;$('mobile-bar').hidden=true;$('demo-indicator').hidden=true;
    applyTheme('haunted');window.scrollTo({top:0,behavior:'instant'});
  }
  function demoParty() {
    stopLive();state.demo=true;state.demoSealed=[];
    state.user=state.user||{id:'demo-user'};
    state.party={id:'demo',title:'THE HAUNT 2026',theme:'haunted',code:'DEMO',owner_id:state.user.id};state.me={user_id:state.user.id,display_name:localStorage.getItem('halloween_snap_name')||'You'};
    state.members=[{user_id:state.user.id,display_name:state.me.display_name},{user_id:'demo-a',display_name:'Alex'},{user_id:'demo-b',display_name:'Jordan'},{user_id:'demo-c',display_name:'Sam'}];
    state.photos=[
      {id:'demo-1',room_id:'demo',author_id:'demo-a',author_name:'Alex',storage_path:'',localUrl:'assets/demo-pumpkin.svg',filter_name:'none',frame_name:'none',caption:'Came for the candy, stayed for the chaos 🎃',created_at:new Date(Date.now()-14*3600000).toISOString()},
      {id:'demo-2',room_id:'demo',author_id:'demo-b',author_name:'Jordan',storage_path:'',localUrl:'assets/demo-ghost.svg',filter_name:'none',frame_name:'none',caption:'Unidentified party guest 👻',created_at:new Date(Date.now()-15*3600000).toISOString()},
      {id:'demo-3',room_id:'demo',author_id:'demo-c',author_name:'Sam',storage_path:'',localUrl:'assets/demo-haunt.svg',filter_name:'none',frame_name:'none',caption:'The house has entered its villain era',created_at:new Date(Date.now()-16*3600000).toISOString()},
      {id:'demo-4',room_id:'demo',author_id:'demo-b',author_name:'Jordan',storage_path:'',localUrl:'assets/demo-video.mp4',media_kind:'video',duration_seconds:5,filter_name:'vampire',frame_name:'bats',caption:'Caught on camera 🎬',created_at:new Date(Date.now()-17*3600000).toISOString()}
    ];
    state.likes=[{photo_id:'demo-1',user_id:'demo-b'},{photo_id:'demo-1',user_id:'demo-c'},{photo_id:'demo-2',user_id:'demo-a'}];
    state.pending={count:2,next:new Date(Date.now()+78*60000).toISOString()};
    state.localTheme=null;applyTheme('haunted');showPartyView();renderGallery();renderCrew();
  }
  function subscribeParty(id) {
    if(state.demo||!state.db)return;
    const callback=()=>scheduleRefresh();
    state.channel=state.db.channel('halloween-snap-'+id)
      .on('postgres_changes',{event:'*',schema:'public',table:'halloween_photos',filter:'room_id=eq.'+id},callback)
      .on('postgres_changes',{event:'*',schema:'public',table:'halloween_likes'},callback)
      .on('postgres_changes',{event:'*',schema:'public',table:'halloween_rooms',filter:'id=eq.'+id},callback)
      .on('postgres_changes',{event:'*',schema:'public',table:'halloween_members',filter:'room_id=eq.'+id},callback)
      .subscribe();
    state.poll=setInterval(()=>{if(!document.hidden)refreshAll().catch(console.warn);},45000);
  }
  function scheduleRefresh() {clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refreshAll().catch(console.warn),450);}
  async function refreshAll() {
    if(state.demo){renderGallery();return;}
    if(state.loading||!state.party)return;
    const loadedRoom=state.party.id;state.loading=true;
    try {
      const [roomRes,membersRes,photoRes,pendingRes]=await Promise.all([
        state.db.from('halloween_rooms').select('*').eq('id',loadedRoom).single(),
        state.db.from('halloween_members').select('user_id,display_name,joined_at').eq('room_id',loadedRoom).order('joined_at',{ascending:true}),
        state.db.from('halloween_photos').select('*').eq('room_id',loadedRoom).order('created_at',{ascending:false}).limit(500),
        state.db.rpc('halloween_pending_status',{p_room_id:loadedRoom})
      ]);
      for(const r of [roomRes,membersRes,photoRes,pendingRes])if(r.error)throw r.error;
      if(state.party?.id!==loadedRoom)return;
      state.party=roomRes.data;state.members=membersRes.data||[];state.photos=photoRes.data||[];
      const pend=Array.isArray(pendingRes.data)?pendingRes.data[0]:pendingRes.data;
      state.pending={count:Number(pend?.pending_count||0),next:pend?.next_release_at||null};
      $('party-title').textContent=state.party.title;
      if(!state.localTheme)applyTheme(state.party.theme);
      const ids=state.photos.map(p=>p.id);
      const chunks=[];for(let i=0;i<ids.length;i+=65)chunks.push(ids.slice(i,i+65));
      const likeResponses=await Promise.all(chunks.map(chunk=>state.db.from('halloween_likes').select('photo_id,user_id').in('photo_id',chunk)));
      state.likes=[];
      for(const r of likeResponses){if(r.error)throw r.error;state.likes.push(...(r.data||[]));}
      await ensureSignedUrls(state.photos);
      if(state.party?.id===loadedRoom){renderGallery();renderCrew();if(!$('viewer-modal').hidden)renderViewer();}
    } catch(e) {console.warn('Refresh failed',e);toast('Could not refresh the wall. Try again.');}
    finally{state.loading=false;}
  }
  async function ensureSignedUrls(photos) {
    const now=Date.now();
    const missing=photos.filter(p=>!state.signed.has(p.storage_path)||state.signed.get(p.storage_path).expires<now).map(p=>p.storage_path);
    const calls=[];for(let i=0;i<missing.length;i+=60)calls.push(missing.slice(i,i+60));
    await Promise.all(calls.map(async chunk=>{
      const {data,error}=await state.db.storage.from('halloween-snaps').createSignedUrls(chunk,3600);
      if(error){console.warn('Could not sign photo URLs',error);return;}
      for(let i=0;i<data.length;i++)if(data[i]?.signedUrl)state.signed.set(chunk[i],{url:data[i].signedUrl,expires:now+48*60000});
    }));
  }
  const getPhotoUrl=p=>p?.localUrl||(state.signed.get(p?.storage_path)?.url||'');
  const countLikes=id=>state.likes.filter(l=>l.photo_id===id).length;
  const didLike=id=>state.likes.some(l=>l.photo_id===id&&l.user_id===state.user?.id);
  function visiblePhotos() {
    let list=state.photos.filter(p=>$('filter-gallery').value!=='mine'||p.author_id===state.user?.id);
    list=[...list];
    const sort=$('sort-gallery').value;
    if(sort==='old')list.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    if(sort==='loved')list.sort((a,b)=>countLikes(b.id)-countLikes(a.id)||new Date(b.created_at)-new Date(a.created_at));
    return list;
  }
  function isVideo(p) { return p?.media_kind==='video'; }
  function mediaFilter(p) { return (FILTERS.find(f=>f.id===p?.filter_name)||FILTERS[0]).css; }
  function countdown(value) {
    if(!value)return 'soon';
    const secs=Math.max(0,Math.ceil((new Date(value).getTime()-Date.now())/1000));
    if(secs<=0)return 'any moment';
    const hours=Math.floor(secs/3600), mins=Math.floor((secs%3600)/60);
    return hours?`${hours}h ${mins}m`:`${Math.max(1,mins)}m`;
  }
  function renderPending() {
    const n=state.pending.count;
    $('sealed-banner').hidden=n===0;
    $('sealed-count').textContent=n;
    $('sealed-count-label').textContent=n===1?'snap sealed':'snaps sealed';
    $('sealed-until').textContent=state.pending.next?'Next reveal in '+countdown(state.pending.next):'Hidden for 12 hours after upload';
  }
  function renderGallery() {
    $('stat-photos').textContent=(state.photos.length+state.pending.count)+(state.photos.length===500?'+':'');
    $('stat-people').textContent=state.members.length;
    renderPending();
    const photos=visiblePhotos();
    $('gallery-empty').hidden=photos.length!==0;
    $('empty-message').textContent=state.pending.count?'The next photos and videos are still sealed. Come back when the countdown ends!':'Be the first one to drop a snap. The party starts with you.';
    const grid=$('gallery-grid');
    grid.innerHTML=photos.map(p=>{
      const url=getPhotoUrl(p),label=(FILTERS.find(f=>f.id===p.filter_name)||FILTERS[0]).label;
      const video=isVideo(p);
      const media=video?`<div class="video-thumb" style="filter:${escapeHTML(mediaFilter(p))}"><video src="${escapeHTML(url)}#t=0.01" preload="metadata" muted playsinline></video><span class="video-play-icon">▶</span><span class="video-duration">${Math.round(p.duration_seconds||0)}s</span></div>`:`<img src="${escapeHTML(url)}" alt="${escapeHTML(p.caption||'A Halloween party photo by '+p.author_name)}" loading="lazy">`;
      return `<article class="photo-card"><button class="photo-tap" type="button" data-action="view" data-id="${escapeHTML(p.id)}" aria-label="Open ${escapeHTML(p.author_name)}'s ${video?'video':'photo'}">${media}<span class="photo-filter-label">✦ ${escapeHTML(video?'VIDEO • '+label.toUpperCase():label.toUpperCase())}</span></button><div class="photo-footer"><div class="photo-byline"><span><span class="photo-avatar">${escapeHTML(initial(p.author_name))}</span><b>${escapeHTML(p.author_name)}</b></span><time>${escapeHTML(dateLabel(p.created_at))}</time></div>${p.caption?`<p class="photo-caption">${escapeHTML(p.caption)}</p>`:''}<div class="photo-actions"><button class="heart-button ${didLike(p.id)?'liked':''}" data-action="like" data-id="${escapeHTML(p.id)}" type="button" aria-label="Like snap">${didLike(p.id)?'♥':'♡'} <span>${countLikes(p.id)}</span></button><button class="photo-open" data-action="view" data-id="${escapeHTML(p.id)}" type="button" aria-label="View snap">VIEW ↗</button></div></div></article>`;
    }).join('');
    if(!$('viewer-modal').hidden)state.viewIds=photos.map(p=>p.id);
  }
  function renderCrew() {
    $('crew-list').innerHTML=state.members.map(m=>`<div class="crew-person"><span class="photo-avatar">${escapeHTML(initial(m.display_name))}</span><b>${escapeHTML(m.display_name)}</b>${m.user_id===state.party?.owner_id?'<small>HOST ✦</small>':''}</div>`).join('');
    $('stat-people').textContent=state.members.length;
  }
  async function toggleLike(id) {
    if(!state.party)return;
    const had=didLike(id);
    if(state.demo) {
      state.likes=state.likes.filter(l=>!(l.photo_id===id&&l.user_id===state.user.id));
      if(!had)state.likes.push({photo_id:id,user_id:state.user.id});
      renderGallery();if(!$('viewer-modal').hidden)renderViewer();return;
    }
    try {
      const result=had?await state.db.from('halloween_likes').delete().eq('photo_id',id).eq('user_id',state.user.id):await state.db.from('halloween_likes').insert({photo_id:id,user_id:state.user.id});
      if(result.error)throw result.error;
      state.likes=state.likes.filter(l=>!(l.photo_id===id&&l.user_id===state.user.id));
      if(!had)state.likes.push({photo_id:id,user_id:state.user.id});
      renderGallery();if(!$('viewer-modal').hidden)renderViewer();
    }catch(e){toast('Could not update reaction: '+e.message);}
  }
  function openViewer(id) {
    state.viewIds=visiblePhotos().map(p=>p.id);
    state.viewIndex=state.viewIds.indexOf(id);
    if(state.viewIndex<0)return;
    renderViewer();showModal('viewer');
  }
  function renderViewer() {
    const id=state.viewIds[state.viewIndex];const p=state.photos.find(p=>p.id===id);
    if(!p){hideModal('viewer');return;}
    const video=isVideo(p);
    const player=$('viewer-video');
    player.pause();player.removeAttribute('src');player.load();
    $('viewer-photo').hidden=video;player.hidden=!video;
    $('viewer-media-frame').hidden=!video||p.frame_name==='none';
    if(p.frame_name!=='none')$('viewer-media-frame').src=frameDataURL(p.frame_name);
    $('viewer-photo').style.filter='none';
    if(video){player.src=getPhotoUrl(p);player.style.filter=mediaFilter(p);player.load();}else{$('viewer-photo').src=getPhotoUrl(p);$('viewer-photo').alt=p.caption||'Photo by '+p.author_name;}
    $('viewer-author').textContent='BY '+p.author_name.toUpperCase()+' • '+dateLabel(p.created_at);
    $('viewer-heading').textContent=p.caption||'One for the memory books ✳';
    $('viewer-like').innerHTML=(didLike(id)?'♥':'♡')+' <span>'+countLikes(id)+'</span>';
    $('viewer-like').classList.toggle('liked',didLike(id));
    $('viewer-delete').hidden=!(state.demo?(p.author_id===state.user?.id):(p.author_id===state.user?.id||state.party?.owner_id===state.user?.id));
    $('viewer-prev').hidden=state.viewIds.length<2;$('viewer-next').hidden=state.viewIds.length<2;
  }
  function viewerMove(step) {if(!state.viewIds.length)return;state.viewIndex=(state.viewIndex+step+state.viewIds.length)%state.viewIds.length;renderViewer();}
  async function downloadView() {
    const id=state.viewIds[state.viewIndex];const p=state.photos.find(p=>p.id===id);if(!p)return;
    try {
      const response=await fetch(getPhotoUrl(p));if(!response.ok)throw new Error('File unavailable');
      const blob=await response.blob();const url=URL.createObjectURL(blob);
      const extension=isVideo(p)?((p.storage_path.match(/\.(mp4|webm|mov)$/)||[])[1]||'mp4'):(blob.type==='image/svg+xml'?'svg':'jpg');
      const a=document.createElement('a');a.href=url;a.download='Halloween-Snap-'+id.slice(0,8)+'.'+extension;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Snap saved!'+(isVideo(p)?' Video effects are preview-only.':''));
    }catch(e){toast('Download unavailable. Try opening the snap in a new tab.');}
  }
  async function deleteView() {
    const id=state.viewIds[state.viewIndex];const p=state.photos.find(p=>p.id===id);if(!p)return;
    if(!window.confirm('Permanently delete this snap for everyone?'))return;
    try {
      if(!state.demo) {
        // Storage policy checks the still-present photo record; delete image first.
        const removed=await state.db.storage.from('halloween-snaps').remove([p.storage_path]);
        if(removed.error)throw removed.error;
        const row=await state.db.from('halloween_photos').delete().eq('id',id).eq('room_id',state.party.id);
        if(row.error)throw row.error;
      }
      state.photos=state.photos.filter(x=>x.id!==id);state.likes=state.likes.filter(x=>x.photo_id!==id);
      await hideModal('viewer');renderGallery();toast('Snap deleted.');
    }catch(e){toast('Could not delete photo: '+e.message);}
  }
  function showShare() {
    if(state.demo){toast('Demo photos are local only. Connect Supabase for a shareable party.');return;}
    if(!state.party)return;
    $('share-code').value=state.party.code;$('share-link').value=partyLink(state.party.code);showModal('share');
  }
  async function copyText(text) {
    try {
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else {const field=document.createElement('textarea');field.value=text;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();if(!document.execCommand('copy'))throw new Error('Copy failed');field.remove();}
      toast('Copied to clipboard!');
    }catch(e){toast('Press and hold the text field to copy it.');}
  }
  async function shareNative() {
    if(!state.party||state.demo)return;
    if(navigator.share){try{await navigator.share({title:state.party.title,text:'Add your photos to our Halloween photo wall 🎃',url:partyLink(state.party.code)});return;}catch(e){if(e.name==='AbortError')return;}}
    copyText(partyLink(state.party.code));
  }

  function frameSVG(frame) {
    const outerStart='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" preserveAspectRatio="none">';
    const borders='<rect x="18" y="18" width="964" height="964" rx="27" fill="none" stroke="#f1da9e" stroke-width="10" opacity=".78"/>';
    const bat='<path d="M0 25C-28 5-38 32-51 16c-1 34 19 29 29 34 4 23 12 27 22 31 10-4 18-8 22-31 10-5 30 0 29-34C38 32 28 5 0 25Z" fill="#171023" stroke="#b798fa" stroke-width="2"/>';
    const webCorner='<g fill="none" stroke="#edf5ec" opacity=".85" stroke-width="6"><path d="M0 0h315M0 0v315M0 0l276 276M0 0l315 90M0 0l90 315M0 0l290 170M0 0l170 290"/><path d="M67 0Q77 78 0 67M145 0Q169 167 0 145M230 0Q250 250 0 230"/></g>';
    const pumpkin='<g><path d="M0 0q-16-39 22-62" stroke="#68c84f" stroke-width="16" fill="none"/><ellipse cx="0" cy="30" rx="81" ry="73" fill="#ff913d" stroke="#ffd081" stroke-width="6"/><path d="m-55 8 27 11-28 11m112-22-27 11 28 11M-37 59q36 33 75 0" stroke="#2e1426" fill="none" stroke-width="15" stroke-linecap="round"/></g>';
    const ghost='<g><path d="M-56 72v-83a58 58 0 01116 0v84l-29-20-31 20-30-20z" fill="#e8eaf7" stroke="#c1a9db" stroke-width="4"/><ellipse cx="-18" cy="5" rx="8" ry="13" fill="#23213f"/><ellipse cx="20" cy="5" rx="8" ry="13" fill="#23213f"/><ellipse cx="2" cy="32" rx="12" ry="17" fill="#23213f"/></g>';
    switch(frame){
      case 'bats':return outerStart+'<rect x="14" y="14" width="972" height="972" rx="28" fill="none" stroke="#b798fa" stroke-width="11"/>'+
        `<g transform="translate(160 125) rotate(-24) scale(1.4)">${bat}</g><g transform="translate(810 145) rotate(19) scale(1.75)">${bat}</g><g transform="translate(800 848) rotate(-15) scale(1.25)">${bat}</g><g transform="translate(185 837) rotate(22) scale(1.1)">${bat}</g></svg>`;
      case 'web':return outerStart+borders+webCorner+`<g transform="translate(1000 0) scale(-1 1)">${webCorner}</g><g transform="translate(0 1000) scale(1 -1)">${webCorner}</g><g transform="translate(1000 1000) scale(-1 -1)">${webCorner}</g></svg>`;
      case 'pumpkins':return outerStart+'<rect x="16" y="16" width="968" height="968" rx="30" fill="none" stroke="#ff9b45" stroke-width="12"/>'+
        `<g transform="translate(110 120) scale(.85)">${pumpkin}</g><g transform="translate(888 888) scale(.85)">${pumpkin}</g><g transform="translate(890 118) scale(.6)">${pumpkin}</g><g transform="translate(104 880) scale(.65)">${pumpkin}</g></svg>`;
      case 'ghosts':return outerStart+'<rect x="16" y="16" width="968" height="968" rx="30" fill="none" stroke="#e6daff" stroke-width="12" stroke-dasharray="26 17"/>'+
        `<g transform="translate(115 118) scale(.9)">${ghost}</g><g transform="translate(889 875) scale(.9)">${ghost}</g><g transform="translate(881 108) scale(.62)">${ghost}</g><g transform="translate(109 894) scale(.62)">${ghost}</g></svg>`;
      default:return '';
    }
  }
  const frameDataURL=frame=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(frameSVG(frame));
  function renderFilterOptions() {
    if(!state.composer.url)return;
    const selected=state.composer.filter,c=state.composer;
    $('filter-list').innerHTML=FILTERS.map(f=>`<button type="button" class="filter-item ${f.id===selected?'active':''}" data-filter="${f.id}"><span class="filter-thumb">${c.kind==='video'?`<span class="filter-video-thumb" style="filter:${f.css}">🎬</span>`:`<img alt="" src="${escapeHTML(c.url)}" style="filter:${f.css}">`}</span><b>${escapeHTML(f.label)}</b></button>`).join('');
    $('frame-list').innerHTML=FRAMES.map(f=>`<button type="button" class="frame-item ${f.id===c.frame?'active':''}" data-frame="${f.id}">${escapeHTML(f.label)}</button>`).join('');
    updateComposerPreview();
  }
  function updateComposerPreview() {
    const c=state.composer;
    const f=FILTERS.find(x=>x.id===c.filter)||FILTERS[0];
    $('edit-photo').style.filter=f.css;$('edit-video').style.filter=f.css;
    $('chosen-filter').textContent=f.label.toUpperCase();
    $('chosen-frame').textContent=(FRAMES.find(x=>x.id===c.frame)||FRAMES[0]).label.toUpperCase();
    $('edit-frame').hidden=c.frame==='none';
    if(c.frame!=='none')$('edit-frame').src=frameDataURL(c.frame);
  }
  function openComposer() {
    if(!state.party){toast('Join a party before posting.');return;}
    $('source-choice').hidden=false;$('camera-stage').hidden=true;$('edit-stage').hidden=true;
    $('photo-caption').value='';$('upload-progress').textContent='';
    state.composer.filter='none';state.composer.frame='none';state.composer.facing='environment';
    showModal('composer');
  }
  function clearComposer() {
    const c=state.composer;
    if(c.url){URL.revokeObjectURL(c.url);c.url=null;}
    c.img=null;c.video=null;c.file=null;c.kind='image';c.duration=0;c.busy=false;
    $('edit-video').pause();$('edit-video').removeAttribute('src');$('edit-video').load();
    $('gallery-file').value='';$('camera-file').value='';$('video-file').value='';$('capture-video-file').value='';
  }
  async function readVideoMetadata(url) {
    const v=document.createElement('video');v.preload='metadata';v.muted=true;v.playsInline=true;
    try {
      v.src=url;
      await new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=()=>reject(new Error('This video format is not supported in your browser. Try MP4/H.264.'));});
      if(!Number.isFinite(v.duration)){ // Some mobile-recorded WebM videos require a seek for duration.
        v.currentTime=1e10;
        await new Promise(resolve=>{v.onseeked=resolve;setTimeout(resolve,1800);});
      }
      if(!(v.duration>0&&Number.isFinite(v.duration)))throw new Error('Cannot read video duration. Convert it to MP4 and try again.');
      if(v.duration>VIDEO_UPLOAD_MAX_SECONDS+0.5)throw new Error('Videos must be 5 minutes (300 seconds) or less. Trim it and try again.');
      return {duration:v.duration,width:v.videoWidth||720,height:v.videoHeight||1280};
    }finally {v.removeAttribute('src');v.load();}
  }
  function getVideoType(file) {
    const type=(file.type||'').split(';')[0].toLowerCase();
    if(type==='video/mp4'||type==='video/quicktime'||type==='video/webm')return type;
    const ext=(file.name||'').split('.').pop().toLowerCase();
    return ({mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'})[ext]||null;
  }
  async function setSource(file) {
    if(!file)return;
    const isVideoFile=file.type.startsWith('video/')||/\.(mp4|mov|webm)$/i.test(file.name||'');
    if(isVideoFile){
      if(file.size>VIDEO_MAX_BYTES){toast('Video is over 50 MB. Trim or compress it before uploading.');return;}
    }else if(file.size>25*1024*1024){toast('This original image is too large (25 MB max).');return;}
    if(!isVideoFile && file.type && !file.type.startsWith('image/')&&!/\.(heic|heif)$/i.test(file.name||'')){toast('Choose an image or MP4/MOV/WebM video.');return;}
    const contentType=isVideoFile?getVideoType(file):null;
    if(isVideoFile&&!contentType){toast('Video format not supported. Choose MP4, MOV, or WebM.');return;}
    const url=URL.createObjectURL(file);
    try {
      let img=null,video=null,duration=0;
      if(isVideoFile){video=await readVideoMetadata(url);duration=video.duration;}
      else {
        img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('This photo format could not be opened by your browser.'));img.src=url;});
        if(!img.naturalWidth||!img.naturalHeight)throw new Error('Image has no dimensions.');
      }
      await stopCamera();
      if(state.composer.url)URL.revokeObjectURL(state.composer.url);
      Object.assign(state.composer,{url,img,video,file,kind:isVideoFile?'video':'image',duration});
      $('source-choice').hidden=true;$('camera-stage').hidden=true;$('edit-stage').hidden=false;
      $('edit-photo').hidden=isVideoFile;$('edit-video').hidden=!isVideoFile;
      if(isVideoFile){$('edit-video').src=url;$('edit-video').load();}else{$('edit-video').pause();$('edit-video').removeAttribute('src');$('edit-photo').src=url;}
      $('editor-kind').textContent=isVideoFile?`VIDEO • ${Math.round(duration)}s / 300s`:'PHOTO';
      $('video-effects-note').hidden=!isVideoFile;
      $('editor-back').textContent=isVideoFile?'← Change video':'← Change photo';
      renderFilterOptions();
    }catch(e){URL.revokeObjectURL(url);toast(e.message);}
  }
  async function startCamera(mode='image') {
    const videoMode=mode==='video';
    if(!navigator.mediaDevices?.getUserMedia){(videoMode?$('capture-video-file'):$('camera-file')).click();return;}
    try {
      await stopCamera();
      const stream=await navigator.mediaDevices.getUserMedia({audio:videoMode,video:{facingMode:{ideal:state.composer.facing},width:{ideal:videoMode?1280:1920},height:{ideal:videoMode?720:1080}}});
      state.composer.stream=stream;state.composer.cameraMode=mode;
      $('camera-preview').srcObject=stream;
      await $('camera-preview').play();
      $('source-choice').hidden=true;$('camera-stage').hidden=false;$('edit-stage').hidden=true;
      $('camera-shutter').hidden=videoMode;$('camera-record').hidden=!videoMode;
      $('record-counter').hidden=!videoMode;$('record-counter').textContent='00:00 / 03:00';
    }catch(e){toast('Live camera unavailable. Choose a video or photo from your device.');(videoMode?$('capture-video-file'):$('camera-file')).click();}
  }
  async function stopCamera() {
    const c=state.composer;
    if(c.recordTimer){clearInterval(c.recordTimer);c.recordTimer=null;}
    if(c.recorder?.state==='recording'){
      c.cancelRecording=true; c.recorder.stop();
    }
    c.recorder=null;
    if(c.stream){c.stream.getTracks().forEach(t=>t.stop());c.stream=null;}
    $('camera-preview').srcObject=null;
    $('camera-record').classList.remove('recording');$('camera-record').textContent='● Record';
  }
  async function snapCamera() {
    const v=$('camera-preview');if(!v.videoWidth||!v.videoHeight){toast('Camera is not ready yet.');return;}
    const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;
    canvas.getContext('2d').drawImage(v,0,0);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.9));
    if(blob)await setSource(new File([blob],'camera.jpg',{type:'image/jpeg'}));
  }
  function recordVideo() {
    const c=state.composer;
    if(c.recorder?.state==='recording'){c.recorder.stop();return;}
    if(!c.stream){toast('Open the camera first.');return;}
    if(!window.MediaRecorder){toast('Your browser cannot record directly. Use Upload video instead.');return;}
    const types=['video/mp4','video/webm;codecs=vp8,opus','video/webm'];
    const mime=types.find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime){toast('Recording format unavailable. Use Upload video instead.');return;}
    const chunks=[];
    let total=0; c.cancelRecording=false;
    try {
      const rec=new MediaRecorder(c.stream,{mimeType:mime,videoBitsPerSecond:1800000});c.recorder=rec;
      rec.ondataavailable=e=>{if(e.data?.size){chunks.push(e.data);total+=e.data.size;}if(total>VIDEO_MAX_BYTES-1024*1024&&rec.state==='recording'){toast('Recording stopped near 50 MB limit.');rec.stop();}};
      rec.onerror=()=>toast('Could not record video on this device.');
      rec.onstop=async()=>{
        if(c.recordTimer){clearInterval(c.recordTimer);c.recordTimer=null;}
        $('camera-record').classList.remove('recording');$('camera-record').textContent='● Record';
        if(c.cancelRecording||!chunks.length)return;
        const outputType=rec.mimeType.startsWith('video/mp4')?'video/mp4':'video/webm';
        const ext=outputType==='video/mp4'?'mp4':'webm';
        const blob=new Blob(chunks,{type:outputType});
        if(blob.size>VIDEO_MAX_BYTES){toast('Video exceeds 50 MB. Record a shorter clip.');return;}
        await setSource(new File([blob],'halloween-recording.'+ext,{type:outputType}));
      };
      rec.start(1000);c.recordStarted=Date.now();
      $('camera-record').classList.add('recording');$('camera-record').textContent='■ Stop';
      c.recordTimer=setInterval(()=>{
        const sec=Math.floor((Date.now()-c.recordStarted)/1000);
        $('record-counter').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')+' / 03:00';
        if(sec>=VIDEO_RECORD_MAX_SECONDS&&rec.state==='recording'){rec.stop();toast('3-minute recording limit reached.');}
      },300);
    }catch(e){toast('Video recording failed. Use Upload video instead.');}
  }
  async function makeEditedJpeg() {
    const c=state.composer,img=c.img;
    if(!img)throw new Error('Choose a photo first.');
    const scale=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
    const width=Math.max(1,Math.round(img.naturalWidth*scale)),height=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:false});
    if(!ctx)throw new Error('Your browser cannot edit this image.');
    const filter=FILTERS.find(f=>f.id===c.filter)||FILTERS[0];
    // Modern browsers support CanvasRenderingContext2D.filter for export.
    // This is the same CSS filter used in preview, so saved photos retain the look.
    if(filter.id!=='none'&&!('filter' in ctx))throw new Error('Photo filters are not supported by this browser. Please update Safari or Chrome.');
    ctx.filter=filter.css;ctx.drawImage(img,0,0,width,height);ctx.filter='none';
    if(c.frame!=='none') {
      const overlay=new Image(),src=frameDataURL(c.frame);
      await new Promise((resolve,reject)=>{overlay.onload=resolve;overlay.onerror=()=>reject(new Error('Could not add that frame.'));overlay.src=src;});
      ctx.drawImage(overlay,0,0,width,height);
    }
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.84));
    if(!blob)throw new Error('Photo export failed.');
    return {blob,width,height};
  }
  async function publishPhoto() {
    const c=state.composer;
    if(c.busy)return;
    c.busy=true;$('publish-photo').disabled=true;
    const status=$('upload-progress');let uploadedPath=null;
    try {
      const video=c.kind==='video';
      status.textContent=video?'✦ Preparing your video...':'✦ Applying Halloween magic...';
      const prepared=video?{blob:c.file,width:c.video.width,height:c.video.height}:await makeEditedJpeg();
      const {blob,width,height}=prepared;
      const caption=$('photo-caption').value.trim().slice(0,140);
      const id=(window.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const v=window.crypto?.getRandomValues?(window.crypto.getRandomValues(new Uint8Array(1))[0]&15):Math.floor(Math.random()*16);return(c==='x'?v:(v&3|8)).toString(16);}));
      const fileType=video?getVideoType(c.file):'image/jpeg';
      const extension=video?({'video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm'})[fileType]:'jpg';
      if(!extension)throw new Error('Unsupported video type.');
      if(video && (c.duration>VIDEO_UPLOAD_MAX_SECONDS+0.5||blob.size>VIDEO_MAX_BYTES))throw new Error('Video exceeds 5 minutes or 50 MB.');
      if(state.demo) {
        const url=URL.createObjectURL(blob);
        state.demoSealed.unshift({id,room_id:'demo',author_id:state.user.id,author_name:state.me.display_name,caption,storage_path:'',localUrl:url,media_kind:video?'video':'image',duration_seconds:video?c.duration:null,filter_name:c.filter,frame_name:c.frame,created_at:new Date().toISOString()});
        state.pending.count++;state.pending.next=state.pending.next||new Date(Date.now()+12*3600000).toISOString();
      } else {
        uploadedPath=state.party.id+'/'+state.user.id+'/'+id+'.'+extension;
        status.textContent=video?'✦ Uploading your video (up to 50 MB)...':'✦ Sending your photo into the vault...';
        const upload=await state.db.storage.from('halloween-snaps').upload(uploadedPath,blob,{contentType:fileType,cacheControl:'3600',upsert:false});
        if(upload.error)throw upload.error;
        const row=await state.db.from('halloween_photos').insert({
          room_id:state.party.id,author_id:state.user.id,storage_path:uploadedPath,caption,
          media_kind:video?'video':'image',duration_seconds:video?c.duration:null,
          filter_name:c.filter,frame_name:c.frame,width,height
        });
        if(row.error)throw row.error;
      }
      await hideModal('composer');
      if(state.demo)renderGallery();else await refreshAll();
      toast('Snap sealed! It will unlock for everyone 12 hours after upload. 🔒');
    }catch(e){
      if(uploadedPath&&state.db)await state.db.storage.from('halloween-snaps').remove([uploadedPath]).catch(()=>{});
      status.textContent='';toast('Could not post: '+(e.message||'Unknown error'));
    }finally{c.busy=false;$('publish-photo').disabled=false;}
  }
  async function setEveryoneTheme() {
    if(state.demo||!state.party||state.party.owner_id!==state.user?.id)return;
    const theme=document.body.dataset.theme;
    const result=await state.db.from('halloween_rooms').update({theme}).eq('id',state.party.id);
    if(result.error){toast('Could not update party theme: '+result.error.message);return;}
    state.party.theme=theme;state.localTheme=null;
    localStorage.removeItem('halloween_snap_theme_'+state.party.id);
    toast('Party-wide theme updated!');
  }
  function setPartyDefaultTheme() {
    if(!state.party)return;
    state.localTheme=null;localStorage.removeItem('halloween_snap_theme_'+state.party.id);
    applyTheme(state.party.theme);toast('Using the party theme.');
  }
  function events() {
    $('create-open').addEventListener('click',()=>showAccess('create'));
    $('join-open').addEventListener('click',()=>showAccess('join'));
    $('demo-open').addEventListener('click',demoParty);
    $('brand-home').addEventListener('click',()=>{if(state.party){if(window.confirm('Leave the photo wall and return to the home screen?'))goHome();}else window.scrollTo({top:0,behavior:'smooth'});});
    $('access-form').addEventListener('submit',submitAccess);
    document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>hideModal(button.dataset.close)));
    $('top-invite').addEventListener('click',showShare);$('stat-invite').addEventListener('click',showShare);$('mobile-share').addEventListener('click',showShare);
    $('top-invite').addEventListener('keydown',e=>e.stopPropagation());
    $('header-add').addEventListener('click',openComposer);$('empty-add').addEventListener('click',openComposer);$('mobile-add').addEventListener('click',openComposer);
    $('mobile-gallery').addEventListener('click',()=>window.scrollTo({top:$('gallery-grid').getBoundingClientRect().top+window.scrollY-105,behavior:'smooth'}));
    $('stat-shots').addEventListener('click',()=>window.scrollTo({top:$('gallery-grid').getBoundingClientRect().top+window.scrollY-120,behavior:'smooth'}));
    $('stat-crew').addEventListener('click',()=>{renderCrew();showModal('crew');});
    $('header-settings').addEventListener('click',()=>showModal('theme'));
    $('theme-shortcut').addEventListener('click',()=>showModal('theme'));
    $('use-party-theme').addEventListener('click',setPartyDefaultTheme);
    $('set-party-theme').addEventListener('click',setEveryoneTheme);
    $('leave-party').addEventListener('click',()=>{hideModal('theme');goHome();});
    $('theme-tiles').addEventListener('click',e=>{const item=e.target.closest('[data-theme-choice]');if(item)setLocalTheme(item.dataset.themeChoice);});
    $('copy-code').addEventListener('click',()=>copyText($('share-code').value));
    $('copy-link').addEventListener('click',()=>copyText($('share-link').value));
    $('native-share').addEventListener('click',shareNative);
    $('filter-gallery').addEventListener('change',renderGallery);$('sort-gallery').addEventListener('change',renderGallery);
    $('refresh-gallery').addEventListener('click',()=>{refreshAll().then(()=>toast('Gallery refreshed ✳'));});
    $('gallery-grid').addEventListener('click',e=>{const item=e.target.closest('[data-action]');if(!item)return;const id=item.dataset.id;if(item.dataset.action==='view')openViewer(id);if(item.dataset.action==='like')toggleLike(id);});
    $('viewer-prev').addEventListener('click',()=>viewerMove(-1));$('viewer-next').addEventListener('click',()=>viewerMove(1));
    $('viewer-like').addEventListener('click',()=>toggleLike(state.viewIds[state.viewIndex]));
    $('viewer-download').addEventListener('click',downloadView);$('viewer-delete').addEventListener('click',deleteView);
    $('choose-photo').addEventListener('click',()=>$('gallery-file').click());
    $('choose-video').addEventListener('click',()=>$('video-file').click());
    $('start-video-camera').addEventListener('click',()=>startCamera('video'));
    $('video-file').addEventListener('change',e=>setSource(e.target.files?.[0]));
    $('capture-video-file').addEventListener('change',e=>setSource(e.target.files?.[0]));
    $('gallery-file').addEventListener('change',e=>setSource(e.target.files?.[0]));
    $('camera-file').addEventListener('change',e=>setSource(e.target.files?.[0]));
    $('start-camera').addEventListener('click',()=>startCamera('image'));
    $('camera-shutter').addEventListener('click',snapCamera);
    $('camera-record').addEventListener('click',recordVideo);
    $('camera-flip').addEventListener('click',async()=>{state.composer.facing=state.composer.facing==='environment'?'user':'environment';await startCamera(state.composer.cameraMode);});
    $('camera-cancel').addEventListener('click',async()=>{await stopCamera();$('camera-stage').hidden=true;$('source-choice').hidden=false;});
    $('editor-back').addEventListener('click',()=>{$('edit-stage').hidden=true;$('source-choice').hidden=false;clearComposer();});
    $('publish-photo').addEventListener('click',publishPhoto);
    $('filter-list').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(b){state.composer.filter=b.dataset.filter;renderFilterOptions();}});
    $('frame-list').addEventListener('click',e=>{const b=e.target.closest('[data-frame]');if(b){state.composer.frame=b.dataset.frame;renderFilterOptions();}});
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){const open=[...document.querySelectorAll('.modal')].filter(el=>!el.hidden);if(open.length)hideModal(open[open.length-1].id.replace('-modal',''));}
      if(!$('viewer-modal').hidden&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){if(e.key==='ArrowRight')viewerMove(1);if(e.key==='ArrowLeft')viewerMove(-1);}
    });
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden&&state.party&&!state.demo)refreshAll().catch(console.warn);
    });
  }
  async function init() {
    events();renderThemes();
    setInterval(()=>{if(state.party){renderPending();if(!state.demo&&state.pending.next&&new Date(state.pending.next).getTime()<=Date.now())scheduleRefresh();}},20000);
    const code=new URL(window.location.href).searchParams.get('party');
    if(!code)return;
    // Returning member: access is granted by existing anonymous Auth session.
    if(ready&&window.supabase?.createClient){
      try{
        state.db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
        const {data}=await state.db.auth.getUser();
        if(data?.user){
          state.user=data.user;
          const {data:room}=await state.db.from('halloween_rooms').select('id,code').eq('code',code.toLowerCase()).maybeSingle();
          if(room){await openParty(room.id,room.code);return;}
        }
      }catch(e){console.warn('Could not automatically restore party:',e);}
    }
    showAccess('join',code);
  }
  init();
})();
