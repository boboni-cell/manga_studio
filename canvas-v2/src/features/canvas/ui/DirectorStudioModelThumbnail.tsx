import type { ReactNode } from 'react';

import { normalizeBlueprintBodyControls } from '@/features/canvas/domain/directorStudioBodyControls';
import type { DirectorStudioModelCatalogItem } from '@/features/canvas/domain/directorStudioModelCatalog';

interface DirectorStudioModelThumbnailProps {
  model: DirectorStudioModelCatalogItem;
}

const STROKE = '#0f172a';
const GLASS = '#bae6fd';
const METAL = '#94a3b8';
const TIRE = '#020617';
const WOOD = '#78350f';
const SCREEN = '#111827';

function SvgFrame({ children }: { children: ReactNode }) {
  return (
    <svg className="h-full w-full" viewBox="0 0 120 90" aria-hidden="true">
      {children}
    </svg>
  );
}

function renderBasic(model: DirectorStudioModelCatalogItem) {
  const color = model.color;
  switch (model.presetId) {
    case 'sphere':
      return <circle cx="60" cy="45" r="24" fill={color} stroke={STROKE} strokeWidth="3" />;
    case 'cylinder':
      return (
        <g fill={color} stroke={STROKE} strokeWidth="3">
          <ellipse cx="60" cy="26" rx="22" ry="8" />
          <path d="M38 26v34c0 5 10 8 22 8s22-3 22-8V26" />
          <ellipse cx="60" cy="60" rx="22" ry="8" />
        </g>
      );
    case 'cone':
      return <path d="M60 14 88 72H32Z" fill={color} stroke={STROKE} strokeWidth="3" strokeLinejoin="round" />;
    case 'torus':
      return (
        <g fill="none" stroke={color} strokeWidth="12">
          <circle cx="60" cy="45" r="24" />
          <circle cx="60" cy="45" r="11" stroke={STROKE} strokeWidth="3" opacity="0.65" />
        </g>
      );
    case 'pipe':
      return (
        <g fill="none" strokeLinecap="round">
          <path d="M28 54c18-28 45-28 64 0" stroke={color} strokeWidth="16" />
          <path d="M28 54c18-28 45-28 64 0" stroke={STROKE} strokeWidth="3" opacity="0.55" />
        </g>
      );
    case 'plane':
    case 'disc':
      return model.presetId === 'disc'
        ? <ellipse cx="60" cy="52" rx="30" ry="12" fill={color} stroke={STROKE} strokeWidth="3" />
        : <path d="M27 60 72 31l25 12-45 29Z" fill={color} stroke={STROKE} strokeWidth="3" strokeLinejoin="round" />;
    case 'ramp':
      return <path d="M25 70h70V30Z" fill={color} stroke={STROKE} strokeWidth="3" strokeLinejoin="round" />;
    case 'terrain':
      return (
        <g fill={color} stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
          <path d="M20 66 55 34l17 16 17-12 14 28Z" />
          <path d="M20 66h84v8H20Z" opacity="0.8" />
        </g>
      );
    default:
      return (
        <g fill={color} stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
          <path d="M33 31 60 18l27 13-27 13Z" opacity="0.95" />
          <path d="M33 31v29l27 14V44Z" opacity="0.78" />
          <path d="M87 31v29L60 74V44Z" opacity="0.88" />
        </g>
      );
  }
}

function renderPerson(model: DirectorStudioModelCatalogItem) {
  const controls = normalizeBlueprintBodyControls(model.bodyControls);
  const visualId = model.visualId ?? model.presetId;
  const isFemale = visualId.includes('female') || visualId.includes('girl') || model.presetId === 'woman';
  const isChild = visualId.includes('child') || controls.style === 'childlike';
  const isTeen = visualId.includes('teen');
  const isElder = visualId.includes('elder');
  const isStrong = visualId.includes('strong') || controls.style === 'strong';
  const isHeavy = visualId.includes('heavy') || controls.style === 'heavy';
  const isSlim = visualId.includes('slim') || controls.style === 'slim';
  const bodyHeight = (isChild ? 44 : isTeen ? 57 : isElder ? 55 : isStrong ? 66 : 64) * controls.core.height;
  const baseTorsoWidth = isHeavy ? 23 : isStrong ? 21 : isSlim ? 12 : isFemale ? 14 : 17;
  const torsoWidth = baseTorsoWidth * controls.core.torsoWidth;
  const shoulderWidth = torsoWidth * (isFemale ? 0.82 : isStrong ? 1.22 : 1.02);
  const hipWidth = torsoWidth * (isFemale ? 1.16 : isHeavy ? 1.08 : 0.94);
  const headR = (isChild ? 10 : 8) * controls.core.headScale;
  const top = 12 + Math.max(0, 64 - bodyHeight) * 0.32;
  const headCy = top + headR;
  const torsoTop = headCy + headR + 3;
  const torsoH = bodyHeight * 0.32;
  const hipY = torsoTop + torsoH;
  const footY = top + bodyHeight + 7;
  const lean = isElder ? -4 : controls.core.torsoLeanDeg * 0.18;
  const x = 60;
  const hair = isFemale ? '#3f2433' : '#1f2937';
  const hasPigtails = visualId.includes('girl');
  return (
    <g stroke={STROKE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      {isFemale ? (
        <path
          d={`M${x - headR * 1.05} ${headCy - 3} Q${x} ${headCy - headR - 8} ${x + headR * 1.05} ${headCy - 3} L${x + headR * 0.9} ${torsoTop + (hasPigtails ? 6 : 13)} Q${x} ${torsoTop + (hasPigtails ? 10 : 20)} ${x - headR * 0.9} ${torsoTop + (hasPigtails ? 6 : 13)}Z`}
          fill={hair}
          stroke="none"
          opacity="0.88"
        />
      ) : null}
      {hasPigtails ? (
        <>
          <ellipse cx={x - headR * 1.35} cy={headCy + headR * 0.34} rx={headR * 0.42} ry={headR * 0.78} fill={hair} stroke="none" />
          <ellipse cx={x + headR * 1.35} cy={headCy + headR * 0.34} rx={headR * 0.42} ry={headR * 0.78} fill={hair} stroke="none" />
        </>
      ) : null}
      <line x1={x - shoulderWidth * 0.5} y1={torsoTop + 5} x2={x - torsoWidth * 0.95} y2={hipY + 7} stroke={model.color} strokeWidth={(isStrong ? 5.4 : 4) * controls.arms.thickness} />
      <line x1={x + shoulderWidth * 0.5} y1={torsoTop + 5} x2={x + torsoWidth * 0.95} y2={hipY + 7} stroke={model.color} strokeWidth={(isStrong ? 5.4 : 4) * controls.arms.thickness} />
      <line x1={x - hipWidth * 0.28} y1={hipY - 1} x2={x - hipWidth * 0.48} y2={footY - 2} stroke={model.color} strokeWidth={(isHeavy ? 6.4 : 5) * controls.legs.thickness} />
      <line x1={x + hipWidth * 0.28} y1={hipY - 1} x2={x + hipWidth * 0.48} y2={footY - 2} stroke={model.color} strokeWidth={(isHeavy ? 6.4 : 5) * controls.legs.thickness} />
      <path
        d={`M${x - shoulderWidth / 2} ${torsoTop} Q${x + lean} ${torsoTop - 4} ${x + shoulderWidth / 2} ${torsoTop} L${x + hipWidth * 0.42} ${hipY} Q${x} ${hipY + 5} ${x - hipWidth * 0.42} ${hipY}Z`}
        fill={model.color}
      />
      <path d={`M${x - torsoWidth * 0.48} ${hipY - 5}H${x + torsoWidth * 0.48}`} stroke="#111827" strokeWidth="3" opacity="0.82" />
      {isHeavy ? <ellipse cx={x} cy={torsoTop + torsoH * 0.62} rx={torsoWidth * 0.52} ry={torsoH * 0.36} fill={model.color} opacity="0.85" /> : null}
      {isChild ? <rect x={x - torsoWidth * 0.36} y={torsoTop + 7} width={torsoWidth * 0.72} height={torsoH * 0.5} rx="3" fill="#334155" stroke="none" opacity="0.72" /> : null}
      <circle cx={x} cy={headCy} r={headR} fill={model.color} />
      {isFemale ? (
        <path d={`M${x - headR * 1.04} ${headCy - 1} Q${x} ${headCy - headR - 9} ${x + headR * 1.04} ${headCy - 1} Q${x + headR * 0.92} ${headCy + headR * 0.62} ${x + headR * 0.48} ${headCy + headR * 0.9} Q${x} ${headCy + headR * 0.36} ${x - headR * 0.48} ${headCy + headR * 0.9} Q${x - headR * 0.92} ${headCy + headR * 0.62} ${x - headR * 1.04} ${headCy - 1}Z`} fill={hair} stroke="none" opacity="0.94" />
      ) : (
        <path d={`M${x - headR * 0.85} ${headCy - 2} Q${x} ${headCy - headR - 6} ${x + headR * 0.85} ${headCy - 2} L${x + headR * 0.65} ${headCy - headR * 0.45} Q${x} ${headCy - headR * 0.95} ${x - headR * 0.65} ${headCy - headR * 0.45}Z`} fill={hair} stroke="none" opacity="0.82" />
      )}
      {isElder ? <path d={`M${x + torsoWidth * 1.08} ${hipY - 2}l7 ${footY - hipY + 5}`} stroke="#3f3f46" strokeWidth="3" /> : null}
      <ellipse cx={x - hipWidth * 0.48} cy={footY} rx="7" ry="3.2" fill="#111827" stroke="none" />
      <ellipse cx={x + hipWidth * 0.48} cy={footY} rx="7" ry="3.2" fill="#111827" stroke="none" />
    </g>
  );
}

function renderProp(model: DirectorStudioModelCatalogItem) {
  const id = model.visualId ?? model.presetId;
  const c = model.color;
  if (id.includes('office-chair')) {
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round" fill={c}>
        <rect x="42" y="24" width="36" height="34" rx="6" />
        <rect x="46" y="30" width="28" height="18" rx="5" fill="#f8fafc" opacity="0.9" />
        <rect x="38" y="55" width="44" height="8" rx="3" />
        <path d="M36 52h48" stroke={METAL} />
        <path d="M60 63v15M45 78h30M50 71l-8 7M70 71l8 7" stroke={METAL} fill="none" />
      </g>
    );
  }
  if (id.includes('chair')) {
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round" fill={c}>
        <rect x="38" y="24" width="44" height="28" rx="4" />
        <rect x="44" y="31" width="32" height="14" rx="4" fill="#f8fafc" opacity="0.9" />
        <rect x="34" y="52" width="52" height="9" rx="3" />
        <path d="M41 61v20M79 61v20M47 61l-8 20M73 61l8 20" stroke={WOOD} />
        <path d="M39 46h42" stroke={WOOD} opacity="0.75" />
      </g>
    );
  }
  if (id.includes('stool')) {
    return (
      <g stroke={STROKE} strokeWidth="3" fill={c}>
        <ellipse cx="60" cy="42" rx="25" ry="10" />
        <path d="M42 47 35 78M60 49v31M78 47l7 31" stroke={WOOD} />
      </g>
    );
  }
  if ((id.includes('desk') || id.includes('table')) && !id.includes('lamp')) {
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round" fill={c}>
        <path d="M24 43h72l-8 13H32Z" />
        <path d="M30 54h60" stroke={WOOD} />
        <path d="M34 56v25M86 56v25M48 56l-4 25M72 56l4 25" stroke={WOOD} />
        {id.includes('desk') ? (
          <>
            <rect x="66" y="58" width="20" height="12" fill={WOOD} />
            <rect x="68" y="62" width="8" height="2" fill={METAL} stroke="none" />
            <rect x="42" y="38" width="24" height="9" fill={SCREEN} />
          </>
        ) : null}
      </g>
    );
  }
  if (id.includes('sofa')) {
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round" fill={c}>
        <rect x="24" y="44" width="72" height="24" rx="7" />
        <rect x="29" y="31" width="62" height="22" rx="6" opacity="0.82" />
        <rect x="19" y="47" width="13" height="24" rx="5" />
        <rect x="88" y="47" width="13" height="24" rx="5" />
        <path d="M60 45v21" stroke={STROKE} opacity="0.55" />
        <rect x="34" y="33" width="18" height="13" rx="4" fill="#f8fafc" opacity="0.88" />
        <rect x="67" y="33" width="18" height="13" rx="4" fill="#f8fafc" opacity="0.88" />
      </g>
    );
  }
  if (id.includes('bed')) {
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
        <rect x="24" y="34" width="72" height="35" rx="4" fill={c} />
        <rect x="24" y="24" width="12" height="48" rx="3" fill={WOOD} />
        <rect x="40" y="38" width="22" height="13" rx="3" fill="#f8fafc" />
      </g>
    );
  }
  if (id.includes('bookshelf') || id.includes('cabinet')) {
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
        <rect x="36" y="18" width="48" height="62" rx="3" fill={c} />
        {id.includes('bookshelf') ? (
          <>
            <path d="M39 32h42M39 45h42M39 58h42M55 20v58" stroke={WOOD} />
            <rect x="42" y="24" width="9" height="12" fill="#60a5fa" stroke="none" />
            <rect x="60" y="40" width="16" height="13" fill="#f97316" stroke="none" />
            <rect x="69" y="60" width="8" height="12" fill="#22c55e" stroke="none" />
          </>
        ) : (
          <>
            <path d="M60 20v58M39 43h42M39 61h42" stroke={WOOD} />
            <circle cx="55" cy="50" r="2.5" fill={METAL} stroke="none" />
            <circle cx="65" cy="50" r="2.5" fill={METAL} stroke="none" />
          </>
        )}
      </g>
    );
  }
  if (id.includes('door') || id.includes('window')) {
    return id.includes('door') ? (
      <g stroke={STROKE} strokeWidth="3" fill={c}>
        <rect x="43" y="14" width="36" height="67" rx="3" />
        <path d="M49 28h24M49 55h24M49 28v46M73 28v46" stroke={STROKE} opacity="0.55" />
        <circle cx="70" cy="48" r="2.5" fill={METAL} stroke="none" />
      </g>
    ) : (
      <g stroke={STROKE} strokeWidth="3" fill={GLASS}>
        <rect x="32" y="25" width="56" height="38" rx="3" />
        <path d="M60 25v38M32 44h56M32 31h56M32 57h56" stroke={STROKE} />
      </g>
    );
  }
  if (id.includes('lamp')) {
    const tall = id.includes('floor');
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
        <path d={tall ? 'M60 32v48M45 80h30' : 'M60 48v28M45 76h30'} stroke={METAL} fill="none" />
        <path d={tall ? 'M42 33h36l-8-18H50Z' : 'M45 48h30l-7-15H52Z'} fill={c} />
      </g>
    );
  }
  if (id.includes('plant')) {
    return (
      <g stroke={STROKE} strokeWidth="3">
        <path d="M60 74V43" stroke="#166534" />
        <circle cx="48" cy="39" r="15" fill="#34d399" />
        <circle cx="68" cy="34" r="18" fill="#22c55e" />
        <ellipse cx="55" cy="28" rx="15" ry="6" fill="#86efac" stroke="none" transform="rotate(-25 55 28)" />
        <ellipse cx="74" cy="45" rx="14" ry="6" fill="#16a34a" stroke="none" transform="rotate(26 74 45)" />
        <path d="M45 74h30l-4 12H49Z" fill="#7c2d12" />
      </g>
    );
  }
  if (id.includes('laptop')) {
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
        <rect x="40" y="25" width="42" height="30" rx="3" fill={SCREEN} />
        <path d="M31 65h58l-8-10H39Z" fill={METAL} />
        <path d="M44 60h28M50 64h16" stroke={SCREEN} />
      </g>
    );
  }
  if (id.includes('phone') || id.includes('cup')) {
    return id.includes('phone') ? (
      <g stroke={STROKE} strokeWidth="3" fill={SCREEN}>
        <rect x="49" y="20" width="22" height="50" rx="5" />
        <circle cx="60" cy="64" r="1.8" fill={METAL} stroke="none" />
      </g>
    ) : (
      <g stroke={STROKE} strokeWidth="3" fill={c}>
        <path d="M45 30h28l-4 42H49Z" />
        <path d="M73 40c13 0 13 18 0 18" fill="none" />
      </g>
    );
  }
  if (id.includes('suitcase')) {
    return (
      <g stroke={STROKE} strokeWidth="3" fill={c}>
        <path d="M48 26c0-7 24-7 24 0" fill="none" />
        <rect x="35" y="30" width="50" height="44" rx="5" />
        <path d="M49 31v42M71 31v42" stroke={STROKE} opacity="0.5" />
      </g>
    );
  }
  if (id.includes('monitor')) {
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
        <rect x="28" y="23" width="64" height="38" rx="4" fill={SCREEN} />
        <rect x="33" y="28" width="54" height="28" rx="2" fill="#1e293b" stroke="none" />
        <path d="M60 61v13M45 75h30" stroke={METAL} />
      </g>
    );
  }
  return renderBasic(model);
}

function renderScene(model: DirectorStudioModelCatalogItem) {
  const id = model.visualId ?? model.presetId;
  const c = model.color;
  if (id.includes('street') || id.includes('parking') || id.includes('park')) {
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
        <path d="M20 70 56 38l44 32Z" fill={id.includes('park') ? '#86efac' : '#64748b'} />
        {id.includes('parking') ? (
          <>
            <path d="M36 62h48M44 52l-8 12M60 45l-8 18M77 52l-8 12M43 68h36" stroke="#f8fafc" />
            <rect x="47" y="45" width="25" height="11" rx="3" fill={c} />
            <circle cx="52" cy="58" r="2.5" fill={TIRE} stroke="none" />
            <circle cx="67" cy="58" r="2.5" fill={TIRE} stroke="none" />
          </>
        ) : id.includes('park') ? (
          <>
            <path d="M42 69c12-20 24-26 42-32" stroke="#f8fafc" fill="none" />
            <circle cx="37" cy="42" r="12" fill="#22c55e" />
            <ellipse cx="45" cy="33" rx="11" ry="5" fill="#86efac" stroke="none" transform="rotate(-25 45 33)" />
            <path d="M37 53v20" stroke={WOOD} />
          </>
        ) : (
          <>
            <path d="M58 39v31M28 62h72" stroke="#f8fafc" />
            <rect x="74" y="24" width="8" height="42" fill={METAL} />
            <circle cx="78" cy="20" r="6" fill="#facc15" />
          </>
        )}
      </g>
    );
  }
  if (id.includes('exterior')) {
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
        {id.includes('apartment') ? (
          <>
            <rect x="36" y="18" width="48" height="59" rx="2" fill={c} />
            {[28, 42, 56].map((y) => [47, 61, 75].map((x) => <rect key={`${x}-${y}`} x={x - 5} y={y - 5} width="9" height="8" fill={GLASS} stroke="none" />))}
            <path d="M50 18v59M66 18v59M36 37h48M36 51h48" stroke={STROKE} opacity="0.38" />
          </>
        ) : (
          <>
            <path d="M28 45 60 20l32 25Z" fill="#b45309" />
            <rect x="36" y="45" width="48" height="32" fill={c} />
            <rect x="56" y="58" width="12" height="19" fill={WOOD} />
            <circle cx="66" cy="66" r="1.8" fill="#facc15" stroke="none" />
            <rect x="42" y="51" width="12" height="10" fill={GLASS} />
            <rect x="70" y="51" width="10" height="10" fill={GLASS} />
            <path d="M42 56h38" stroke={STROKE} opacity="0.38" />
          </>
        )}
      </g>
    );
  }
  return (
    <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
      <path d="M24 72h72V30H24Z" fill={c} opacity="0.45" />
      <path d="M24 30h72l-15-12H38Z" fill={c} />
      {id.includes('bedroom') ? (
        <>
          <rect x="34" y="50" width="42" height="17" fill="#c084fc" />
          <rect x="34" y="42" width="10" height="25" fill={WOOD} />
        </>
      ) : id.includes('kitchen') ? (
        <>
          <rect x="33" y="52" width="52" height="15" fill={METAL} />
          <rect x="72" y="34" width="13" height="32" fill="#e2e8f0" />
        </>
      ) : id.includes('classroom') ? (
        <>
          <rect x="36" y="34" width="48" height="15" fill="#064e3b" />
          <path d="M38 61h44M43 61v12M77 61v12" stroke={WOOD} />
        </>
      ) : id.includes('hospital') ? (
        <>
          <rect x="32" y="53" width="49" height="14" fill="#f8fafc" />
          <rect x="82" y="41" width="10" height="17" fill={SCREEN} />
        </>
      ) : id.includes('cafe') || id.includes('restaurant') ? (
        <>
          <rect x="36" y="50" width="48" height="10" fill={WOOD} />
          <circle cx="48" cy="42" r="6" fill="#facc15" />
          <rect x="62" y="37" width="20" height="10" fill={SCREEN} />
        </>
      ) : id.includes('warehouse') ? (
        <>
          <rect x="34" y="38" width="18" height="30" fill="#a16207" />
          <rect x="58" y="42" width="26" height="24" fill="#92400e" />
          <path d="M32 34h56M32 47h56M32 60h56" stroke={METAL} />
        </>
      ) : (
        <>
          <rect x="32" y="51" width="38" height="14" fill="#f59e0b" />
          <rect x="74" y="41" width="14" height="24" fill={SCREEN} />
        </>
      )}
    </g>
  );
}

function renderVehicle(model: DirectorStudioModelCatalogItem) {
  const id = model.visualId ?? model.presetId;
  const c = model.color;
  if (id.includes('bicycle') || id.includes('motorcycle') || id.includes('scooter')) {
    const motor = id.includes('motorcycle') || id.includes('scooter');
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round" fill="none">
        <circle cx="36" cy="62" r="14" stroke={TIRE} />
        <circle cx="82" cy="62" r="14" stroke={TIRE} />
        <path d={motor ? 'M41 58h30l13-17' : 'M38 60 55 40l18 20H38l18-20 18 0'} stroke={c} strokeWidth={5} />
        <path d="M55 40h13M70 36h16" stroke={METAL} />
        {id.includes('scooter') ? <path d="M80 45 91 28" stroke={METAL} /> : null}
      </g>
    );
  }
  if (id.includes('subway')) {
    return (
      <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
        <rect x="18" y="31" width="84" height="30" rx="6" fill={c} />
        {[31, 47, 63, 79].map((x) => <rect key={x} x={x - 6} y="37" width="10" height="10" fill={GLASS} stroke="none" />)}
        <path d="M54 31v30" stroke={STROKE} opacity="0.55" />
        <circle cx="35" cy="66" r="5" fill={TIRE} />
        <circle cx="83" cy="66" r="5" fill={TIRE} />
      </g>
    );
  }
  const long = id.includes('bus') || id.includes('truck') || id.includes('van');
  const tall = id.includes('suv') || id.includes('van') || id.includes('ambulance') || id.includes('bus');
  return (
    <g stroke={STROKE} strokeWidth="3" strokeLinejoin="round">
      <rect x={long ? 18 : 25} y={tall ? 42 : 47} width={long ? 84 : 70} height={tall ? 23 : 18} rx="4" fill={c} />
      <path d={long ? 'M31 42h56l9 23H24Z' : 'M39 32h38l11 33H30Z'} fill={c} opacity="0.86" />
      <rect x={long ? 33 : 45} y={tall ? 36 : 39} width={long ? 38 : 28} height="13" fill={GLASS} />
      <path d={long ? 'M52 36v13M72 36v13' : 'M59 39v13'} stroke={STROKE} opacity="0.55" />
      <rect x={long ? 89 : 84} y={tall ? 48 : 52} width="5" height="5" fill="#fef9c3" stroke="none" />
      <rect x={long ? 22 : 27} y={tall ? 49 : 53} width="5" height="5" fill="#ef4444" stroke="none" />
      <path d={long ? 'M42 53h13M68 53h13' : 'M50 54h12M68 54h12'} stroke={METAL} />
      {id.includes('taxi') ? <rect x="52" y="25" width="17" height="7" rx="2" fill="#fef3c7" /> : null}
      {id.includes('police') || id.includes('ambulance') ? <rect x="52" y="27" width="19" height="6" rx="2" fill={id.includes('police') ? '#ef4444' : '#38bdf8'} /> : null}
      {id.includes('truck') ? <rect x="23" y="36" width="24" height="29" fill={METAL} /> : null}
      <circle cx={long ? 37 : 43} cy="68" r="8" fill={TIRE} />
      <circle cx={long ? 83 : 78} cy="68" r="8" fill={TIRE} />
      <circle cx={long ? 37 : 43} cy="68" r="3" fill={METAL} stroke="none" />
      <circle cx={long ? 83 : 78} cy="68" r="3" fill={METAL} stroke="none" />
    </g>
  );
}

export function DirectorStudioModelThumbnail({ model }: DirectorStudioModelThumbnailProps) {
  let content: ReactNode;
  if (model.itemCategory === 'person' || model.thumbnailKind === 'person') {
    content = renderPerson(model);
  } else if (model.thumbnailKind === 'vehicle') {
    content = renderVehicle(model);
  } else if (model.itemCategory === 'scene') {
    content = renderScene(model);
  } else if (model.thumbnailKind === 'furniture' || model.thumbnailKind === 'tool') {
    content = renderProp(model);
  } else {
    content = renderBasic(model);
  }
  return <SvgFrame>{content}</SvgFrame>;
}
