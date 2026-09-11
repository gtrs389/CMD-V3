import type { Metadata, Viewport } from 'next';
import { TeamAccessForm } from '@/components/public/TeamAccessForm';
import { GENERIC_LINK_ERROR, resolveTeamAccess } from '@/lib/server/team-access.service';
import styles from '@/components/auth/login.module.css';

export const metadata: Metadata = {
  title: 'Acesso do time',
  robots: { index: false, follow: false },
};

/** A arte da tela e escura: a barra do navegador acompanha. */
export const viewport: Viewport = {
  themeColor: '#071b34',
};

/** O token e conferido no banco a cada abertura: nunca e pre-renderizada. */
export const dynamic = 'force-dynamic';

/**
 * Entrada dos Administradores do time.
 *
 * E a MESMA tela de login do sistema, com a mesma arte e o mesmo cartao: so
 * o conteudo do formulario muda, porque aqui existe um unico campo, o
 * telefone.
 *
 * O token e opaco e nao carrega nenhum dado pessoal: quem o traduz para um
 * time e o servidor, e nada do time chega a tela — nem o nome dele, nem nome
 * de pessoa, nem telefone, nem lista de quem tem acesso. Link inexistente,
 * revogado ou substituido recebe sempre a mesma mensagem neutra.
 */
export default async function TeamAccessPage({ params }: PageProps<'/acesso/time/[token]'>) {
  const { token } = await params;
  const context = await resolveTeamAccess(token).catch(() => null);

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

      <section className={styles['auth-column']} aria-labelledby="acesso-title">
        <div className={styles['mobile-brand']} aria-hidden="true">
          <strong>CMD</strong>
          <span>Cadastro Mobilização Digital</span>
        </div>

        <div className={styles['login-card']}>
          <div className={styles['brand-badge']} aria-hidden="true">
            <span className={styles['badge-word']}>CMD</span>
          </div>

          {context ? (
            <>
              {/* Nem o nome do time aparece aqui: a tela de entrada nao
                  revela nada sobre quem esta do outro lado do link. */}
              <h1 id="acesso-title">Bem-vindo de volta</h1>

              <TeamAccessForm token={token} />
            </>
          ) : (
            <>
              <h1 id="acesso-title">Acesso indisponível</h1>
              <p className={styles.subtitle} role="alert">
                {GENERIC_LINK_ERROR}
              </p>
            </>
          )}

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
          </div>
        </div>
      </section>
    </main>
  );
}
