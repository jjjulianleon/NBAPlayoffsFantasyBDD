import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const BENEFITS = [
  'Crea o unete a ligas exclusivas de playoffs',
  'Draftea rosters de 8 jugadores con multiplicadores por ronda',
  'Sigue reportes de scouting y cambios de racha rapidamente',
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
          Arma un roster
          <br />
          para la corrida larga.
        </h1>
        <div className="mt-10 space-y-4">
          {BENEFITS.map((item) => (
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

export default function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await register(form);
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
          <p className="text-xs font-body font-semibold uppercase tracking-[0.22em] text-[--color-text-muted]">Nueva franquicia</p>
          <h2 className="mt-3 font-display text-4xl uppercase tracking-tight text-[--color-text]">Crea tu cuenta</h2>

          {error ? <div className="mt-6 rounded-md border border-[--color-danger]/40 bg-[--color-danger]/10 px-4 py-3 text-sm text-[--color-danger]">{error}</div> : null}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <label className="field-label" htmlFor="register-username">Usuario</label>
              <input id="register-username" className="field w-full" value={form.username} onChange={setField('username')} placeholder="playoffgm" />
            </div>
            <div className="space-y-2">
              <label className="field-label" htmlFor="register-email">Correo</label>
              <input id="register-email" type="email" className="field w-full" value={form.email} onChange={setField('email')} placeholder="gm@playoffhoops.com" />
            </div>
            <div className="space-y-2">
              <label className="field-label" htmlFor="register-password">Contrasena</label>
              <input id="register-password" type="password" className="field w-full" value={form.password} onChange={setField('password')} placeholder="Crea una contrasena segura" />
            </div>
            <button type="submit" className="button-primary w-full">
              Crear cuenta
            </button>
          </form>

          <p className="mt-6 text-sm text-[--color-text-muted]">
            Ya tienes cuenta?{' '}
            <Link to="/login" className="inline-flex items-center gap-1 text-[--color-accent]">
              Ingresa
              <ChevronRight className="h-4 w-4" />
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
