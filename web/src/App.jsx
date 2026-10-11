import { VERSIONS, DEFAULT_VERSION } from './versions/index.jsx';

export default function App() {
  const key = new URLSearchParams(window.location.search).get('v') || DEFAULT_VERSION;
  const Version = VERSIONS[key] ?? VERSIONS[DEFAULT_VERSION];
  return <Version />;
}
