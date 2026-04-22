import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';

const FEATURES = [
  '791 jugadores reales de la NBA',
  'Multiplicadores de puntuacion por ronda (Finales x2.0)',
  'Reportes de scouting con IA',
];

function AuthVisual() {
  return (
    <div
      className="relative hidden min-h-[calc(100vh-4rem)] overflow-hidden md:block"
      style={{
        backgroundImage:
          "linear-gradient(135deg, rgba(10,10,11,0.85), rgba(249,115,22,0.25)), url('https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1600&q=80')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[--color-bg] via-transparent to-[--color-bg-elev]" />
      <div className="relative z-10 flex h-full flex-col justify-center px-12">
        <p className="font-display text-2xl uppercase tracking-[0.24em] text-[--color-text]">Playoff Hoops</p>
        <h1 className="mt-6 max-w-xl font-display text-5xl italic uppercase leading-[0.95] tracking-tight text-[--color-text]">
          Draftea como GM.
          <br />
          Gana los playoffs.
        </h1>
        <div className="mt-10 space-y-4">
          {FEATURES.map((item) => (
            <div key={item} className="flex items-center gap-3 text-sm text-white/78">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5">
                <Check className="h-4 w-4 text-[--color-accent]" />
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
        <p className="mt-10 text-xs uppercase tracking-[0.2em] text-white/45">Datos: temporadas NBA 2023-26. Con tecnologia nba_api.</p>
      </div>
    </div>
  );
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/leagues');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="grid min-h-[calc(100vh-4rem)] md:grid-cols-2">
      <AuthVisual />

      <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="text-xs font-body font-semibold uppercase tracking-[0.22em] text-[--color-text-muted]">Bienvenido de vuelta</p>
          <h2 className="mt-3 font-display text-4xl uppercase tracking-tight text-[--color-text]">Entra a tu franquicia</h2>

          {error ? <div className="mt-6 rounded-md border border-[--color-danger]/40 bg-[--color-danger]/10 px-4 py-3 text-sm text-[--color-danger]">{error}</div> : null}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <label className="field-label" htmlFor="username">Usuario</label>
              <input id="username" className="field w-full" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="playoffgm" />
            </div>
            <div className="space-y-2">
              <label className="field-label" htmlFor="password">Contrasena</label>
              <input id="password" type="password" className="field w-full" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ingresa tu contrasena" />
            </div>
            <button type="submit" className="button-primary w-full">
              Ingresar
            </button>
          </form>

          <p className="mt-6 text-sm text-[--color-text-muted]">
            No tienes cuenta?{' '}
            <Link to="/register" className="inline-flex items-center gap-1 text-[--color-accent]">
              Crea una
              <ChevronRight className="h-4 w-4" />
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
