// Shared responsive navigation; no session, requests or business state.
export function installStrategyNavigation(){
const $=id=>document.getElementById(id);
const mobileLayout=window.matchMedia('(max-width:768px)');
const drawer=$('navigation-drawer'),sidebar=document.querySelector('.sidebar');
function closeNavigation(){if(drawer.open)drawer.close();$('mobile-menu').setAttribute('aria-expanded','false');}
function updateNavigationLayout(){
 closeNavigation();
 if(mobileLayout.matches)drawer.append(sidebar);
 else $('workspace').prepend(sidebar);
}
$('mobile-menu').onclick=()=>{drawer.showModal();$('mobile-menu').setAttribute('aria-expanded','true');};
$('close-navigation').onclick=closeNavigation;
drawer.addEventListener('close',()=>{$('mobile-menu').setAttribute('aria-expanded','false');});
drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeNavigation();}});
sidebar.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('button').disabled)closeNavigation();},true);
mobileLayout.addEventListener('change',updateNavigationLayout);
updateNavigationLayout();

}
