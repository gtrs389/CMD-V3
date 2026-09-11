import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getCurrentUser } from '@/lib/auth/server';
import { homePathFor } from '@/lib/auth/constants';
import { LoginForm } from '@/components/auth/LoginForm';
import styles from '@/components/auth/login.module.css';

export const metadata: Metadata = {
  title: 'Entrar',
};

/** A arte da tela e escura: a barra do navegador acompanha. */
export const viewport: Viewport = {
  themeColor: '#071b34',
};

/** Depende do cookie de sessao: nunca e pre-renderizada. */
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // Sessao valida nao precisa ver o login. A conferencia e feita no banco,
  // nunca apenas pela presenca do cookie.
  const current = await getCurrentUser();
  if (current) redirect(homePathFor(current));

  const params = await searchParams;
  const raw = params?.proximo;
  const candidate = Array.isArray(raw) ? raw[0] : raw;

  // Aceita apenas caminhos internos: evita redirecionamento para outro site.
  const next = candidate && /^\/(?!\/)/.test(candidate) ? candidate : undefined;

  const senha = Array.isArray(params?.senha) ? params.senha[0] : params?.senha;
  const senhaAlterada = senha === 'alterada';

  return (
    <main className={styles['login-page']} data-fullbleed>
      <div className={styles.artwork} aria-hidden="true" />
      <div className={styles.scan} aria-hidden="true" />

      <svg
        className={styles['route-layer']}
        viewBox="0 0 1000 940"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path id="route-a" className={styles.route} d="M355 220 C535 225 585 390 760 478" />
        <path id="route-b" className={styles.route} d="M317 365 C475 330 600 510 760 478" />
        <path id="route-c" className={styles.route} d="M690 715 C685 615 720 555 760 478" />
        <circle className={styles.traveler} r={3.5}>
          <animateMotion dur="5.6s" repeatCount="indefinite" begin=".3s">
            <mpath href="#route-a" />
          </animateMotion>
        </circle>
        <circle className={styles.traveler} r={3}>
          <animateMotion dur="6.8s" repeatCount="indefinite" begin="1.7s">
            <mpath href="#route-b" />
          </animateMotion>
        </circle>
        <circle className={styles.traveler} r={3.5}>
          <animateMotion dur="5.1s" repeatCount="indefinite" begin="2.2s">
            <mpath href="#route-c" />
          </animateMotion>
        </circle>
      </svg>

      {/*
        INICIO DOS TEXTOS EDITAVEIS DA AREA VISUAL
        Para trocar qualquer frase, altere somente o conteudo entre as tags abaixo.
      */}
      <section className={styles['hero-copy']} aria-label="Apresentação do CMD">
        <p className={`${styles['hero-micro']} ${styles['hero-micro--top-left']}`}>
          <span>Dados</span>
          <span>Planejamento</span>
          <span>Mobilização</span>
          <span>Impacto</span>
        </p>

        <p className={styles['hero-coordinates']}>
          <span>05.8831 S</span>
          <span>35.0159 W</span>
        </p>

        <p className={`${styles['hero-micro']} ${styles['hero-micro--top-right']}`}>
          <span>Mais</span>
          <span>Organização</span>
          <span>Mais</span>
          <span>Possibilidades</span>
        </p>

        <div className={styles['hero-brand']}>
          <div className={styles['hero-wordmark']}>CMD</div>
          <p className={styles['hero-brand-name']}>Cadastro Mobilização Digital</p>
        </div>

        <h2 className={styles['hero-title']}>
          Mobilização começa
          <br />
          com <span>organização.</span>
        </h2>

        <p className={`${styles['hero-micro']} ${styles['hero-micro--bottom-left']}`}>
          <span>Território</span>
          <span>Estratégia</span>
          <span>Pessoas</span>
          <span>Resultados</span>
        </p>

        <p className={`${styles['hero-micro']} ${styles['hero-micro--bottom-right']}`}>
          <span>Brasil</span>
          <span>Em operação</span>
        </p>
      </section>
      {/* FIM DOS TEXTOS EDITAVEIS DA AREA VISUAL */}

      <section className={styles['auth-column']} aria-labelledby="login-title">
        <div className={styles['mobile-brand']} aria-hidden="true">
          <strong>CMD</strong>
          <span>Cadastro Mobilização Digital</span>
        </div>

        <div className={styles['login-card']}>
          <div className={styles['brand-badge']} aria-hidden="true">
            <span className={styles['badge-word']}>CMD</span>
          </div>

          <p className={styles.eyebrow}>Acesso administrativo</p>
          <h1 id="login-title">Bem-vindo de volta</h1>
          <p className={styles.subtitle}>Entre para acessar sua operação.</p>

          <LoginForm
            next={next}
            configured={isSupabaseConfigured()}
            senhaAlterada={senhaAlterada}
          />

          <div className={styles.security}>
            <span className={styles['status-dot']} aria-hidden="true" />
            <svg
              className={styles.lock}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>Área exclusiva para administradores</span>
          </div>
        </div>
      </section>
    </main>
  );
}
