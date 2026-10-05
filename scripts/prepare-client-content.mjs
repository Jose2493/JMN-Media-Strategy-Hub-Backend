// Trusted JMN workstation tool. Never shipped as a public/admin HTTP endpoint.
// Usage: node scripts/prepare-client-content.mjs config.json [--upload]
import {readFile,writeFile,mkdtemp,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,extname,basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {UUID} from '../lib/strategistStore.js';
import {CONTENT_BUCKET} from '../lib/approvedContent.js';

const mime={
  jpg:'image/jpeg',
  jpeg:'image/jpeg',
  png:'image/png',
  mp4:'video/mp4',
  mov:'video/quicktime'
};

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

function run(program,args){
  const r=spawnSync(program,args,{
    encoding:'utf8',
    maxBuffer:8*1024*1024
  });

  if(r.status!==0){
    throw new Error(
      program+' failed: '+
      (r.stderr||r.error?.message||'unknown error').slice(-1800)
    );
  }

  return r.stdout;
}

// FFmpeg filter expressions require Windows drive-letter colons
// and path separators to be escaped differently from normal CLI paths.
function ffmpegFilterPath(value){
  return value
    .replace(/\\/g,'/')
    .replace(/:/g,'\\:')
    .replace(/'/g,"\\'");
}

export async function prepare(config){
  if(
    !UUID.test(config.companyId||'') ||
    typeof config.companyName!=='string' ||
    !config.companyName.trim() ||
    config.companyName.length>100 ||
    typeof config.title!=='string' ||
    !config.title.trim() ||
    config.title.length>160
  ){
    throw new Error(
      'Provide companyId, companyName (up to 100 characters) and title (up to 160).'
    );
  }

  if(
    (config.caption||'').length>2200 ||
    (config.projectLabel||'').length>160
  ){
    throw new Error('Caption or project label exceeds its limit.');
  }

  const input=resolve(config.file);
  const ext=extname(input).slice(1).toLowerCase();

  if(!mime[ext]){
    throw new Error('Use JPEG, PNG, MP4 or MOV.');
  }

  const size=(await stat(input)).size;

  if(!size || size>500*1024*1024){
    throw new Error(
      'Master must be between 1 byte and 500 MiB; your storage plan may impose a smaller limit.'
    );
  }

  const id=randomUUID();
  const dir=await mkdtemp(join(tmpdir(),'jmn-review-'));
  const kind=['jpg','jpeg','png'].includes(ext)?'IMAGE':'REELS';

  const probe=JSON.parse(
    run('ffprobe',[
      '-v','error',
      '-show_streams',
      '-of','json',
      input
    ])
  );

  const video=probe.streams.find(s=>s.codec_type==='video');

  if(!video){
    throw new Error('No image/video stream found.');
  }

  if(
    kind==='IMAGE' &&
    (video.width/video.height<0.8 || video.width/video.height>1.91)
  ){
    throw new Error(
      'Export an image between 4:5 and 1.91:1 for Instagram.'
    );
  }

  const originalHash=sha(await readFile(input));

  const font=resolve(
    config.fontFile ||
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
  );

  await stat(font);

  const fontCopy=join(dir,'font.ttf');
  await writeFile(fontCopy,await readFile(font));

  const mark=join(dir,'watermark.txt');

  // Text comes from a file with expansion disabled,
  // never from shell/filter syntax.
  await writeFile(
    mark,
    'JMN MEDIA PREVIEW\n'+
    config.companyName
      .replace(/[\r\n\t]/g,' ')
      .match(/.{1,40}/g)
      .join('\n')+
    '\nFOR REVIEW ONLY · '+
    id.slice(0,8)
  );

  const social=join(
    dir,
    'social.'+(kind==='IMAGE'?'jpg':'mp4')
  );

  const review=join(
    dir,
    'review.'+(kind==='IMAGE'?'jpg':'mp4')
  );

  const poster=join(dir,'poster.jpg');

  const scale=
    "scale=w='min(1080,iw)':h=-2:force_divisible_by=2,setsar=1";

  const cleanArgs=
    kind==='IMAGE'
      ? ['-frames:v','1','-q:v','2']
      : [
          '-map','0:v:0',
          '-map','0:a?',
          '-c:v','libx264',
          '-preset','medium',
          '-crf','20',
          '-pix_fmt','yuv420p',
          '-c:a','aac',
          '-b:a','192k',
          '-movflags','+faststart'
        ];

  run('ffmpeg',[
    '-v','error',
    '-nostdin',
    '-y',
    '-i',input,
    '-vf',scale,
    '-map_metadata','-1',
    ...cleanArgs,
    social
  ]);

  if(
    (await stat(social)).size >
    (kind==='IMAGE'?8:100)*1024*1024
  ){
    throw new Error(
      'Social rendition exceeds Instagram upload limit. '+
      'Export a shorter/smaller source; the master remains untouched.'
    );
  }

  // FFmpeg filter paths require special Windows escaping.
  const filterFont=ffmpegFilterPath(fontCopy);
  const filterMark=ffmpegFilterPath(mark);

  // Three burnt-in bands resist a simple edge crop.
  // Video bands drift vertically.
  const watermarks=[0.18,0.48,0.78].map(
    (y,i)=>
      "drawtext="+
      "fontfile='"+filterFont+"':"+
      "textfile='"+filterMark+"':"+
      "expansion=none:"+
      "fontcolor=white@0.8:"+
      "fontsize=w/42:"+
      "box=1:"+
      "boxcolor=black@0.38:"+
      "boxborderw=8:"+
      "x=(w-text_w)/2:"+
      "y=h*"+y+
      (
        kind==='REELS'
          ? "+sin(t/5+"+i+")*h*0.025"
          : ''
      )
  );

  const filter=
    "scale=w='min(720,iw)':h=-2:force_divisible_by=2,setsar=1,"+
    watermarks.join(',');

  const reviewArgs=
    kind==='IMAGE'
      ? ['-frames:v','1','-q:v','5']
      : [
          '-map','0:v:0',
          '-map','0:a?',
          '-c:v','libx264',
          '-preset','medium',
          '-crf','29',
          '-maxrate','1500k',
          '-bufsize','3000k',
          '-pix_fmt','yuv420p',
          '-c:a','aac',
          '-b:a','96k',
          '-movflags','+faststart'
        ];

  run('ffmpeg',[
    '-v','error',
    '-nostdin',
    '-y',
    '-i',social,
    '-vf',filter,
    '-map_metadata','-1',
    ...reviewArgs,
    review
  ]);

  run('ffmpeg',[
    '-v','error',
    '-nostdin',
    '-y',
    '-i',review,
    '-frames:v','1',
    '-q:v','4',
    poster
  ]);

  if(sha(await readFile(input))!==originalHash){
    throw new Error(
      'Master changed during preparation. Retry with an immutable source.'
    );
  }

  const base=config.companyId+'/'+id+'/';

  const metadata={
    id,
    company_id:config.companyId,
    title:config.title,
    kind,
    original_filename:basename(input)
      .replace(/[^\p{L}\p{N} ._()-]/gu,'_')
      .slice(0,180),
    original_ext:ext,
    original_sha256:originalHash,
    original_bytes:size,
    master_path:base+'master.'+ext,
    review_path:base+'review.'+(kind==='IMAGE'?'jpg':'mp4'),
    poster_path:base+'poster.jpg',
    publishing_path:base+'social.'+(kind==='IMAGE'?'jpg':'mp4'),
    caption:config.caption||'',
    project_label:config.projectLabel||null,
    status:'IN_REVIEW'
  };

  await writeFile(
    join(dir,'manifest.json'),
    JSON.stringify(metadata,null,2),
    {mode:0o600}
  );

  return {
    dir,
    metadata,
    files:[
      [
        metadata.master_path,
        input,
        mime[ext]
      ],
      [
        metadata.review_path,
        review,
        kind==='IMAGE'?'image/jpeg':'video/mp4'
      ],
      [
        metadata.poster_path,
        poster,
        'image/jpeg'
      ],
      [
        metadata.publishing_path,
        social,
        kind==='IMAGE'?'image/jpeg':'video/mp4'
      ]
    ]
  };
}

export async function uploadPrepared(db,result){
  const uploaded=[];
  let registering=false;

  try{
    for(const [key,file,contentType] of result.files){
      const bytes=await readFile(file);

      if(
        key===result.metadata.master_path &&
        sha(bytes)!==result.metadata.original_sha256
      ){
        throw new Error('Master changed before upload.');
      }

      const r=await db.storage
        .from(CONTENT_BUCKET)
        .upload(
          key,
          bytes,
          {
            contentType,
            upsert:false,
            cacheControl:'0'
          }
        );

      if(r.error){
        throw new Error(
          'Private media upload failed. Check bucket limits and credentials.'
        );
      }

      uploaded.push(key);
    }

    registering=true;

    const r=await db
      .from('social_approved_assets')
      .insert(result.metadata);

    if(r.error){
      throw new Error(
        'Content registration failed. Check the migration and company.'
      );
    }

  }catch(error){

    // An ambiguous insert may have committed.
    // Preserve files for reconciliation; never delete a master
    // that a registered asset may already reference.
    if(uploaded.length&&!registering){
      await db.storage
        .from(CONTENT_BUCKET)
        .remove(uploaded);
    }

    throw error;
  }
}

if(
  process.argv[1] &&
  resolve(process.argv[1])===fileURLToPath(import.meta.url)
){
  try{
    const config=JSON.parse(
      await readFile(process.argv[2],'utf8')
    );

    let db;

    if(process.argv.includes('--upload')){
      if(
        !process.env.SUPABASE_URL ||
        !process.env.SUPABASE_SECRET_KEY
      ){
        throw new Error(
          'Set trusted workstation Supabase credentials. '+
          'Never put them in the config.'
        );
      }

      db=createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SECRET_KEY,
        {
          auth:{
            persistSession:false,
            autoRefreshToken:false
          }
        }
      );

      const {data,error}=await db
        .from('companies')
        .select('id,business_name')
        .eq('id',config.companyId)
        .single();

      if(error||!data){
        throw new Error('Company not found.');
      }

      config.companyName=data.business_name;

      const bucket=await db.storage.getBucket(CONTENT_BUCKET);

      if(bucket.error||bucket.data.public){
        throw new Error(
          'A private jmn-content bucket is required.'
        );
      }
    }

    const result=await prepare(config);

    if(db){
      await uploadPrepared(db,result);
    }

    console.log(
      JSON.stringify({
        assetId:result.metadata.id,
        status:db?'IN_REVIEW':'LOCAL_ONLY',
        output:result.dir
      })
    );

  }catch(error){
    console.error(error.message);
    process.exitCode=1;
  }
}