// Used only by the fictional Preview shell. Change the actual child viewport,
// exercising production media queries and the unchanged parent height helper.
const frame=document.getElementById('jmn-client-cockpit');
const width=document.getElementById('frame-width');
width.addEventListener('change',()=>{
  if(['100%','390px','320px'].includes(width.value))frame.style.width=width.value;
});
