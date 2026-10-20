export const routes = Object.freeze({
  strategy: 'https://portal.jmnmedia.com/portal/dashboard/view/173775',
  social: 'https://portal.jmnmedia.com/portal/dashboard/view/174976'
});
export function cockpitModel(data) {
  const attention = [];
  if (data.review > 0) attention.push({title:`${data.review} item${data.review===1?'':'s'} awaiting review`, detail:'Review your content and share your approval.', route:'social'});
  if (data.drafts > 0) attention.push({title:`${data.drafts} draft${data.drafts===1?'':'s'} ready to revisit`, detail:'Check the caption and choose a publishing time.', route:'social'});
  if (data.instagram && (data.instagram.attention || !data.instagram.total)) attention.push({title:data.instagram.total?'Instagram needs attention':'Connect Instagram',detail:'Check your account connection in Social Center.',route:'social'});
  const incomplete = Object.values(data).some(value => value === null);
  const pulse = data.review > 0 ? 'Your next move is a review. Give clear feedback so your content can move toward publishing.'
    : data.drafts > 0 ? 'Move one draft forward. Check the message, confirm your audience’s next step, and choose its timing.'
    : data.approved > 0 ? 'Put approved work to use. Choose one piece that supports your goal and plan its next outing.'
    : data.scheduled > 0 ? 'Your publishing plan is moving. Shape your next useful story with your strategist.'
    : 'Start with one goal. Bring your audience, your offer, and one question to Strategy Session.';
  const priorityTitle=data.review>0?'Review your next piece of content':data.drafts>0?'Move one draft forward':data.approved>0?'Put approved content to work':'Shape your next useful story';
  return {name:data.company?.business_name || 'Your workspace',attention,incomplete,pulse,priorityTitle,
    action:attention.length || data.approved > 0 ? 'social':'strategy',
    status:[data.review===null?'Reviews unavailable':`${data.review} awaiting review`,data.scheduled===null?'Schedule unavailable':`${data.scheduled} scheduled`,data.instagram===null?'Instagram status unavailable':data.instagram.attention?'Instagram needs attention':data.instagram.connected?'Instagram connected':'Instagram not connected'].join(' · '),
    pipeline:[['In Review',data.review],['Approved',data.approved],['Scheduled',data.scheduled],['Published',data.published]]};
}
