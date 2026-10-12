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
  const pulse = data.review > 0 ? 'Your next move is a review. Give your content clear feedback so approved work can move toward publishing.'
    : data.drafts > 0 ? 'You have a draft to move forward. Check the message, confirm the next step for your audience, and choose its timing.'
    : data.approved > 0 ? 'Your approved work is ready to use. Choose one piece that supports your current goal and plan its next outing.'
    : data.scheduled > 0 ? 'Your publishing plan is moving. Use this time to shape the next useful story with your strategist.'
    : 'Start with one clear goal. Bring your audience, your offer, and one question to your next Strategy Session.';
  return {name:data.company?.business_name || 'Your workspace',attention,incomplete,pulse,
    action:attention.length || data.approved > 0 ? 'social':'strategy',
    status:[data.review===null?'Reviews unavailable':`${data.review} awaiting review`,data.scheduled===null?'Schedule unavailable':`${data.scheduled} scheduled`,data.instagram===null?'Instagram status unavailable':data.instagram.attention?'Instagram needs attention':data.instagram.connected?'Instagram connected':'Instagram not connected'].join(' · '),
    pipeline:[['In Review',data.review],['Approved',data.approved],['Scheduled',data.scheduled],['Published',data.published]]};
}
