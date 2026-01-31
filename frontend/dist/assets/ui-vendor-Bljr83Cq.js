import{r as e}from"./react-vendor-C1B6conR.js";let t,r,a,o={data:""},i=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,s=/\/\*[^]*?\*\/|  +/g,n=/\n+/g,l=(e,t)=>{let r="",a="",o="";for(let i in e){let s=e[i];"@"==i[0]?"i"==i[1]?r=i+" "+s+";":a+="f"==i[1]?l(s,i):i+"{"+l(s,"k"==i[1]?"":t)+"}":"object"==typeof s?a+=l(s,t?t.replace(/([^,])+/g,e=>i.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,t=>/&/.test(t)?t.replace(/&/g,e):e?e+" "+t:t)):i):null!=s&&(i=/^--/.test(i)?i:i.replace(/[A-Z]/g,"-$&").toLowerCase(),o+=l.p?l.p(i,s):i+":"+s+";")}return r+(t&&o?t+"{"+o+"}":o)+a},d={},c=e=>{if("object"==typeof e){let t="";for(let r in e)t+=r+c(e[r]);return t}return e};function u(e){let t=this||{},r=e.call?e(t.p):e;return((e,t,r,a,o)=>{let u=c(e),p=d[u]||(d[u]=(e=>{let t=0,r=11;for(;t<e.length;)r=101*r+e.charCodeAt(t++)>>>0;return"go"+r})(u));if(!d[p]){let t=u!==e?e:(e=>{let t,r,a=[{}];for(;t=i.exec(e.replace(s,""));)t[4]?a.shift():t[3]?(r=t[3].replace(n," ").trim(),a.unshift(a[0][r]=a[0][r]||{})):a[0][t[1]]=t[2].replace(n," ").trim();return a[0]})(e);d[p]=l(o?{["@keyframes "+p]:t}:t,r?"":"."+p)}let m=r&&d.g?d.g:null;return r&&(d.g=d[p]),f=d[p],y=t,g=a,(b=m)?y.data=y.data.replace(b,f):-1===y.data.indexOf(f)&&(y.data=g?f+y.data:y.data+f),p;var f,y,g,b})(r.unshift?r.raw?((e,t,r)=>e.reduce((e,a,o)=>{let i=t[o];if(i&&i.call){let e=i(r),t=e&&e.props&&e.props.className||/^go/.test(e)&&e;i=t?"."+t:e&&"object"==typeof e?e.props?"":l(e,""):!1===e?"":e}return e+a+(null==i?"":i)},""))(r,[].slice.call(arguments,1),t.p):r.reduce((e,r)=>Object.assign(e,r&&r.call?r(t.p):r),{}):r,(e=>{if("object"==typeof window){let t=(e?e.querySelector("#_goober"):window._goober)||Object.assign(document.createElement("style"),{innerHTML:" ",id:"_goober"});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||o})(t.target),t.g,t.o,t.k)}u.bind({g:1});let p=u.bind({k:1});function m(e,o){let i=this||{};return function(){let o=arguments;return function s(n,l){let d=Object.assign({},n),c=d.className||s.className;i.p=Object.assign({theme:r&&r()},d),i.o=/ *go\d+/.test(c),d.className=u.apply(i,o)+(c?" "+c:"");let p=e;return e[0]&&(p=d.as||e,delete d.as),a&&p[0]&&a(d),t(p,d)}}}var f=(e,t)=>(e=>"function"==typeof e)(e)?e(t):e,y=(()=>{let e=0;return()=>(++e).toString()})(),g=(()=>{let e;return()=>{if(void 0===e&&typeof window<"u"){let t=matchMedia("(prefers-reduced-motion: reduce)");e=!t||t.matches}return e}})(),b="default",h=(e,t)=>{let{toastLimit:r}=e.settings;switch(t.type){case 0:return{...e,toasts:[t.toast,...e.toasts].slice(0,r)};case 1:return{...e,toasts:e.toasts.map(e=>e.id===t.toast.id?{...e,...t.toast}:e)};case 2:let{toast:a}=t;return h(e,{type:e.toasts.find(e=>e.id===a.id)?1:0,toast:a});case 3:let{toastId:o}=t;return{...e,toasts:e.toasts.map(e=>e.id===o||void 0===o?{...e,dismissed:!0,visible:!1}:e)};case 4:return void 0===t.toastId?{...e,toasts:[]}:{...e,toasts:e.toasts.filter(e=>e.id!==t.toastId)};case 5:return{...e,pausedAt:t.time};case 6:let i=t.time-(e.pausedAt||0);return{...e,pausedAt:void 0,toasts:e.toasts.map(e=>({...e,pauseDuration:e.pauseDuration+i}))}}},v=[],x={toasts:[],pausedAt:void 0,settings:{toastLimit:20}},w={},E=(e,t=b)=>{w[t]=h(w[t]||x,e),v.forEach(([e,r])=>{e===t&&r(w[t])})},k=e=>Object.keys(w).forEach(t=>E(e,t)),$=(e=b)=>t=>{E(t,e)},j={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},C=e=>(t,r)=>{let a=((e,t="blank",r)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:t,ariaProps:{role:"status","aria-live":"polite"},message:e,pauseDuration:0,...r,id:(null==r?void 0:r.id)||y()}))(t,e,r);return $(a.toasterId||(e=>Object.keys(w).find(t=>w[t].toasts.some(t=>t.id===e)))(a.id))({type:2,toast:a}),a.id},D=(e,t)=>C("blank")(e,t);D.error=C("error"),D.success=C("success"),D.loading=C("loading"),D.custom=C("custom"),D.dismiss=(e,t)=>{let r={type:3,toastId:e};t?$(t)(r):k(r)},D.dismissAll=e=>D.dismiss(void 0,e),D.remove=(e,t)=>{let r={type:4,toastId:e};t?$(t)(r):k(r)},D.removeAll=e=>D.remove(void 0,e),D.promise=(e,t,r)=>{let a=D.loading(t.loading,{...r,...null==r?void 0:r.loading});return"function"==typeof e&&(e=e()),e.then(e=>{let o=t.success?f(t.success,e):void 0;return o?D.success(o,{id:a,...r,...null==r?void 0:r.success}):D.dismiss(a),e}).catch(e=>{let o=t.error?f(t.error,e):void 0;o?D.error(o,{id:a,...r,...null==r?void 0:r.error}):D.dismiss(a)}),e};var O,A,N,z,I=(t,r="default")=>{let{toasts:a,pausedAt:o}=((t={},r=b)=>{let[a,o]=e.useState(w[r]||x),i=e.useRef(w[r]);e.useEffect(()=>(i.current!==w[r]&&o(w[r]),v.push([r,o]),()=>{let e=v.findIndex(([e])=>e===r);e>-1&&v.splice(e,1)}),[r]);let s=a.toasts.map(e=>{var r,a,o;return{...t,...t[e.type],...e,removeDelay:e.removeDelay||(null==(r=t[e.type])?void 0:r.removeDelay)||(null==t?void 0:t.removeDelay),duration:e.duration||(null==(a=t[e.type])?void 0:a.duration)||(null==t?void 0:t.duration)||j[e.type],style:{...t.style,...null==(o=t[e.type])?void 0:o.style,...e.style}}});return{...a,toasts:s}})(t,r),i=e.useRef(new Map).current,s=e.useCallback((e,t=1e3)=>{if(i.has(e))return;let r=setTimeout(()=>{i.delete(e),n({type:4,toastId:e})},t);i.set(e,r)},[]);e.useEffect(()=>{if(o)return;let e=Date.now(),t=a.map(t=>{if(t.duration===1/0)return;let a=(t.duration||0)+t.pauseDuration-(e-t.createdAt);if(!(a<0))return setTimeout(()=>D.dismiss(t.id,r),a);t.visible&&D.dismiss(t.id)});return()=>{t.forEach(e=>e&&clearTimeout(e))}},[a,o,r]);let n=e.useCallback($(r),[r]),l=e.useCallback(()=>{n({type:5,time:Date.now()})},[n]),d=e.useCallback((e,t)=>{n({type:1,toast:{id:e,height:t}})},[n]),c=e.useCallback(()=>{o&&n({type:6,time:Date.now()})},[o,n]),u=e.useCallback((e,t)=>{let{reverseOrder:r=!1,gutter:o=8,defaultPosition:i}=t||{},s=a.filter(t=>(t.position||i)===(e.position||i)&&t.height),n=s.findIndex(t=>t.id===e.id),l=s.filter((e,t)=>t<n&&e.visible).length;return s.filter(e=>e.visible).slice(...r?[l+1]:[0,l]).reduce((e,t)=>e+(t.height||0)+o,0)},[a]);return e.useEffect(()=>{a.forEach(e=>{if(e.dismissed)s(e.id,e.removeDelay);else{let t=i.get(e.id);t&&(clearTimeout(t),i.delete(e.id))}})},[a,s]),{toasts:a,handlers:{updateHeight:d,startPause:l,endPause:c,calculateOffset:u}}},P=p`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,_=p`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,F=p`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,L=m("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${P} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${_} 0.15s ease-out forwards;
    animation-delay: 150ms;
    position: absolute;
    border-radius: 3px;
    opacity: 0;
    background: ${e=>e.secondary||"#fff"};
    bottom: 9px;
    left: 4px;
    height: 2px;
    width: 12px;
  }

  &:before {
    animation: ${F} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,M=p`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,T=m("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${e=>e.secondary||"#e0e0e0"};
  border-right-color: ${e=>e.primary||"#616161"};
  animation: ${M} 1s linear infinite;
`,H=p`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,S=p`
0% {
	height: 0;
	width: 0;
	opacity: 0;
}
40% {
  height: 0;
	width: 6px;
	opacity: 1;
}
100% {
  opacity: 1;
  height: 10px;
}`,R=m("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${H} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${S} 0.2s ease-out forwards;
    opacity: 0;
    animation-delay: 200ms;
    position: absolute;
    border-right: 2px solid;
    border-bottom: 2px solid;
    border-color: ${e=>e.secondary||"#fff"};
    bottom: 6px;
    left: 6px;
    height: 10px;
    width: 6px;
  }
`,U=m("div")`
  position: absolute;
`,q=m("div")`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,B=p`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,Y=m("div")`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${B} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,Z=({toast:t})=>{let{icon:r,type:a,iconTheme:o}=t;return void 0!==r?"string"==typeof r?e.createElement(Y,null,r):r:"blank"===a?null:e.createElement(q,null,e.createElement(T,{...o}),"loading"!==a&&e.createElement(U,null,"error"===a?e.createElement(L,{...o}):e.createElement(R,{...o})))},G=e=>`\n0% {transform: translate3d(0,${-200*e}%,0) scale(.6); opacity:.5;}\n100% {transform: translate3d(0,0,0) scale(1); opacity:1;}\n`,J=e=>`\n0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}\n100% {transform: translate3d(0,${-150*e}%,-1px) scale(.6); opacity:0;}\n`,K=m("div")`
  display: flex;
  align-items: center;
  background: #fff;
  color: #363636;
  line-height: 1.3;
  will-change: transform;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05);
  max-width: 350px;
  pointer-events: auto;
  padding: 8px 10px;
  border-radius: 8px;
`,Q=m("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,V=e.memo(({toast:t,position:r,style:a,children:o})=>{let i=t.height?((e,t)=>{let r=e.includes("top")?1:-1,[a,o]=g()?["0%{opacity:0;} 100%{opacity:1;}","0%{opacity:1;} 100%{opacity:0;}"]:[G(r),J(r)];return{animation:t?`${p(a)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${p(o)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}})(t.position||r||"top-center",t.visible):{opacity:0},s=e.createElement(Z,{toast:t}),n=e.createElement(Q,{...t.ariaProps},f(t.message,t));return e.createElement(K,{className:t.className,style:{...i,...a,...t.style}},"function"==typeof o?o({icon:s,message:n}):e.createElement(e.Fragment,null,s,n))});O=e.createElement,l.p=A,t=O,r=N,a=z;var W=({id:t,className:r,style:a,onHeightUpdate:o,children:i})=>{let s=e.useCallback(e=>{if(e){let r=()=>{let r=e.getBoundingClientRect().height;o(t,r)};r(),new MutationObserver(r).observe(e,{subtree:!0,childList:!0,characterData:!0})}},[t,o]);return e.createElement("div",{ref:s,className:r,style:a},i)},X=u`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,ee=({reverseOrder:t,position:r="top-center",toastOptions:a,gutter:o,children:i,toasterId:s,containerStyle:n,containerClassName:l})=>{let{toasts:d,handlers:c}=I(a,s);return e.createElement("div",{"data-rht-toaster":s||"",style:{position:"fixed",zIndex:9999,top:16,left:16,right:16,bottom:16,pointerEvents:"none",...n},className:l,onMouseEnter:c.startPause,onMouseLeave:c.endPause},d.map(a=>{let s=a.position||r,n=((e,t)=>{let r=e.includes("top"),a=r?{top:0}:{bottom:0},o=e.includes("center")?{justifyContent:"center"}:e.includes("right")?{justifyContent:"flex-end"}:{};return{left:0,right:0,display:"flex",position:"absolute",transition:g()?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${t*(r?1:-1)}px)`,...a,...o}})(s,c.calculateOffset(a,{reverseOrder:t,gutter:o,defaultPosition:r}));return e.createElement(W,{id:a.id,key:a.id,onHeightUpdate:c.updateHeight,className:a.visible?X:"",style:n},"custom"===a.type?f(a.message,a):i?i(a):e.createElement(V,{toast:a,position:s}))}))},te=D;function re(e){var t,r,a="";if("string"==typeof e||"number"==typeof e)a+=e;else if("object"==typeof e)if(Array.isArray(e)){var o=e.length;for(t=0;t<o;t++)e[t]&&(r=re(e[t]))&&(a&&(a+=" "),a+=r)}else for(r in e)e[r]&&(a&&(a+=" "),a+=r);return a}function ae(){for(var e,t,r=0,a="",o=arguments.length;r<o;r++)(e=arguments[r])&&(t=re(e))&&(a&&(a+=" "),a+=t);return a}export{ee as F,ae as c,D as n,te as z};
