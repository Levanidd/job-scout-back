import type { ReactNode } from "react"

import { useApp } from "../app-context"
import { RefreshIcon } from "../components/icons"

/**
 * Callout colours are deliberately none of the app's own: the buttons being
 * pointed at are violet, so a violet ring around a violet button is invisible.
 * Position decides the colour, so the ring and its legend line always match.
 */
const TONES = ["lime", "cyan", "pink", "amber", "sky"]

function tone(n: number): string {
  return `tone-${TONES[(n - 1) % TONES.length]}`
}

function Hit({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className={`guide-hit ${tone(n)}`}>
      <span className="guide-mark">{n}</span>
      <span className="guide-ring">{children}</span>
    </span>
  )
}

function Shot({ legend, children }: { legend: string[]; children: ReactNode }) {
  return (
    <figure className="guide-figure">
      <div className="guide-shot" aria-hidden="true">
        {children}
      </div>
      <ol className="guide-legend">
        {legend.map((text, index) => (
          <li key={text} className={tone(index + 1)}>
            <span className="guide-mark">{index + 1}</span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </figure>
  )
}

export function Guide() {
  const { me } = useApp()
  const master = me?.role === "master"
  return (
    <div className="guide">
      <section className="card">
        <h3 className="card-title">Как работать</h3>
        <p className="card-sub">
          Вакансии и источники общие для всех. Оценки, фильтры, отклики и скрытое — только ваши. Сначала
          настройте профиль, потом соберите вакансии, потом разбирайте ленту.
        </p>
      </section>

      <section className="card">
        <h3 className="card-title">1. Собрать свежие вакансии</h3>
        <p className="card-sub">Обход всех включённых источников. Score ставится по вашему профилю, чужие оценки не меняются.</p>
        <Shot legend={["«Прогнать» — запустить обход, идёт на сервере, вкладку можно закрыть", "«Обновить» — перечитать уже собранное, без обхода"]}>
          <div className="guide-chrome">
            <strong className="guide-brand">JobRadar</strong>
            <span className="muted">Анна</span>
            <Hit n={1}>
              <span className="btn btn-primary btn-sm">Прогнать</span>
            </Hit>
            <Hit n={2}>
              <span className="btn btn-ghost btn-sm">Обновить</span>
            </Hit>
          </div>
        </Shot>
      </section>

      <section className="card">
        <h3 className="card-title">2. Настроить, что вам подходит</h3>
        <p className="card-sub">Вкладка «Профиль». Всё здесь — только про вас.</p>
        <Shot
          legend={[
            "Теги «должно содержать»: без совпадения вакансия даже не дойдёт до модели",
            "Теги «не должно»: одно совпадение — и вакансия отсеяна",
            "Чёрный список: компания скрыта у вас, у остальных остаётся",
            "Текст профиля уходит в скоринг — это единственная ручка калибровки",
          ]}
        >
          <div className="guide-stack">
            <div className="guide-mini-card">
              <span className="guide-mini-title">Префильтр по названию</span>
              <div className="guide-tags">
                <Hit n={1}>
                  <span className="tag tag-keep">product manager</span>
                </Hit>
                <span className="tag tag-keep">head of product</span>
                <Hit n={2}>
                  <span className="tag tag-drop">intern</span>
                </Hit>
              </div>
              <span className="btn btn-primary btn-sm">Сохранить теги</span>
            </div>

            <div className="guide-mini-card">
              <span className="guide-mini-title">Чёрный список компаний</span>
              <Hit n={3}>
                <span className="tag tag-drop">Acme ×</span>
              </Hit>
            </div>

            <div className="guide-mini-card">
              <span className="guide-mini-title">Профиль для скоринга</span>
              <Hit n={4}>
                <span className="guide-textarea">Senior PM, B2B SaaS, Berlin или remote EU…</span>
              </Hit>
              <span className="btn btn-primary btn-sm">Сохранить</span>
            </div>
          </div>
        </Shot>
      </section>

      <section className="card">
        <h3 className="card-title">3. Добавить компанию</h3>
        <p className="card-sub">«Ресурсы» → «Источники». Доска, которую вы добавили, появляется у всех.</p>
        <Shot
          legend={[
            "Ссылки на карьерные страницы — одна или сразу несколько, по одной на строку. ATS определится сам",
            "«Добавить»: проверит каждую ссылку и подключит доску. Что не опознано — останется в поле",
            "«Прогнать» на строке — обойти только эту доску, не запуская весь цикл",
          ]}
        >
          <div className="guide-stack">
            <div className="guide-pills">
              <span className="guide-pill">Discovery</span>
              {master ? <span className="guide-pill">Исследовать</span> : null}
              <span className="guide-pill is-on">Источники</span>
            </div>
            <Hit n={1}>
              <span className="guide-textarea">https://jobs.lever.co/company</span>
            </Hit>
            <div className="guide-row">
              <Hit n={2}>
                <span className="btn btn-primary btn-sm">Добавить</span>
              </Hit>
            </div>
            <div className="guide-source-row">
              <strong>Acme</strong>
              <span className="badge badge-neutral">12 вакансий</span>
              <Hit n={3}>
                <span className="btn btn-sm">Прогнать</span>
              </Hit>
            </div>
          </div>
        </Shot>
      </section>

      <section className="card">
        <h3 className="card-title">4. Разобрать ленту</h3>
        <p className="card-sub">
          «Вакансии». По умолчанию видно то, что прошло ваш префильтр, со score от 50. Кнопка «Карточка» в конце
          строки открывает вакансию целиком — с описанием, причиной оценки и заметками.
        </p>
        <Shot
          legend={[
            "«Подался» — отметка уходит во вкладку «Подался» и в статистику",
            "«Смотрел» — чтобы отличать разобранное от нового",
            "«Позже» — отложить, не меняя статус вакансии",
            "Клик по компании — все её вакансии, какие у нас есть",
            "Score: насколько вакансия близка вашему профилю. Иконка рядом — пересчитать его",
          ]}
        >
          <div className="guide-table">
            <div className="guide-thead">
              <span>Подался</span>
              <span>Смотрел</span>
              <span>Позже</span>
              <span>Вакансия</span>
              <span>Score</span>
            </div>
            <div className="guide-trow">
              <Hit n={1}>
                <input type="checkbox" className="checkbox" defaultChecked readOnly tabIndex={-1} />
              </Hit>
              <Hit n={2}>
                <input type="checkbox" className="checkbox" defaultChecked readOnly tabIndex={-1} />
              </Hit>
              <Hit n={3}>
                <input type="checkbox" className="checkbox" readOnly tabIndex={-1} />
              </Hit>
              <span className="guide-cell">
                <span className="guide-link">Senior Product Manager</span>
                <Hit n={4}>
                  <span className="cell-sub">Acme · Berlin</span>
                </Hit>
              </span>
              <Hit n={5}>
                <span className="score-cell">
                  <span className="badge badge-positive">82</span>
                  <span className="icon-btn">
                    <RefreshIcon />
                  </span>
                </span>
              </Hit>
            </div>
          </div>
        </Shot>
      </section>

      <section className="card">
        <h3 className="card-title">5. Вести отклики</h3>
        <p className="card-sub">
          «Подался» — только то, куда отметились вы. «Статистика» считает вашу воронку, не общую.
        </p>
        <Shot
          legend={[
            "Фильтр по этапу: все, подался, интервью, отказ",
            "Клик по компании — все её вакансии, какие у нас есть",
            "Этап меняется прямо в строке — подсвечен текущий",
            "Заметки: с кем говорили и что дальше, их видите только вы",
          ]}
        >
          <div className="guide-stack">
            <Hit n={1}>
              <span className="guide-pills">
                <span className="guide-pill is-on">Все</span>
                <span className="guide-pill">Подался</span>
                <span className="guide-pill">Интервью</span>
                <span className="guide-pill">Отказ</span>
              </span>
            </Hit>
            <div className="guide-source-row">
              <strong>Head of Product</strong>
              <Hit n={2}>
                <span className="cell-sub">Beispiel Bank</span>
              </Hit>
              <Hit n={3}>
                <span className="btn btn-primary btn-sm">Интервью</span>
              </Hit>
              <span className="btn btn-sm">Отказ</span>
            </div>
            <div className="guide-mini-card">
              <span className="guide-mini-title">Заметки</span>
              <Hit n={4}>
                <span className="guide-textarea">Отправила CV 3 марта, ждут ответ рекрутера…</span>
              </Hit>
            </div>
          </div>
        </Shot>
      </section>
    </div>
  )
}
