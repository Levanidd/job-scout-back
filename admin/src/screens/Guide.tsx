import type { ReactNode } from "react"

function Hit({ children, label, pin = "up" }: { children: ReactNode; label: string; pin?: "up" | "down" }) {
  return (
    <span className={`guide-hit guide-hit-${pin}`}>
      {children}
      <span className="guide-pin">{label}</span>
    </span>
  )
}

function Shot({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="guide-figure">
      <div className="guide-shot" aria-hidden="true">
        {children}
      </div>
      <figcaption className="guide-caption">{caption}</figcaption>
    </figure>
  )
}

export function Guide() {
  return (
    <div className="guide">
      <section className="card">
        <h3 className="card-title">Как работать</h3>
        <p className="card-sub">
          Вакансии и источники общие. Оценки, фильтры, отклики и скрытое — только ваши. Сначала настройте
          профиль, потом соберите вакансии, потом разбирайте ленту.
        </p>
      </section>

      <section className="card">
        <h3 className="card-title">1. Собрать свежие вакансии</h3>
        <p className="card-sub">
          Кнопка в шапке обходит все включённые источники и ставит score по вашему профилю. Чужие оценки не
          трогает.
        </p>
        <Shot caption="Шапка. Фиолетовая кнопка запускает обход.">
          <div className="guide-chrome">
            <strong>JobRadar</strong>
            <div className="guide-chrome-actions">
              <span className="muted">Анна</span>
              <Hit label="Сюда">
                <span className="btn btn-primary btn-sm">Прогнать</span>
              </Hit>
              <span className="btn btn-ghost btn-sm">Обновить</span>
            </div>
          </div>
        </Shot>
      </section>

      <section className="card">
        <h3 className="card-title">2. Настроить, что вам подходит</h3>
        <p className="card-sub">
          Вкладка «Профиль». Теги отсекают названия до модели. Чёрный список прячет компанию только у вас —
          вакансии всё равно собираются. Текст уходит в скоринг.
        </p>
        <Shot caption="Профиль. Сохраните теги, затем текст для модели.">
          <div className="guide-stack">
            <div className="guide-mini-card">
              <span className="guide-mini-title">Префильтр по названию</span>
              <div className="guide-tags">
                <Hit label="Должно быть">
                  <span className="tag tag-keep">product manager</span>
                </Hit>
                <span className="tag tag-keep">head of product</span>
                <Hit label="Не должно">
                  <span className="tag tag-drop">intern</span>
                </Hit>
              </div>
              <span className="btn btn-primary btn-sm">Сохранить теги</span>
            </div>
            <div className="guide-mini-card">
              <span className="guide-mini-title">Чёрный список</span>
              <span className="tag tag-drop">Acme ×</span>
            </div>
            <div className="guide-mini-card">
              <span className="guide-mini-title">Профиль для скоринга</span>
              <div className="guide-textarea">Senior PM, B2B, Berlin / remote EU…</div>
              <Hit label="После правок">
                <span className="btn btn-primary btn-sm">Сохранить</span>
              </Hit>
            </div>
          </div>
        </Shot>
      </section>

      <section className="card">
        <h3 className="card-title">3. Добавить компанию</h3>
        <p className="card-sub">
          «Ресурсы» → «Источники». Вставьте ссылку на карьерную страницу — доска появится у всех. Одну
          компанию можно прогнать с карточки, не запуская весь цикл.
        </p>
        <Shot caption="Источники. Добавление по ссылке и прогон одной доски.">
          <div className="guide-stack">
            <div className="guide-pills">
              <span className="guide-pill">Discovery</span>
              <span className="guide-pill">Исследовать</span>
              <span className="guide-pill is-on">Источники</span>
            </div>
            <div className="row">
              <Hit label="Ссылка на карьеры">
                <span className="guide-fake-input">https://jobs.lever.co/company</span>
              </Hit>
              <span className="btn btn-primary btn-sm">Проверить</span>
            </div>
            <div className="guide-source-row">
              <strong>Acme</strong>
              <span className="muted">12</span>
              <span className="btn btn-sm">Вакансии</span>
              <Hit label="Только эту">
                <span className="btn btn-sm">Прогнать</span>
              </Hit>
            </div>
          </div>
        </Shot>
      </section>

      <section className="card">
        <h3 className="card-title">4. Разобрать ленту</h3>
        <p className="card-sub">
          «Вакансии». По умолчанию — то, что прошло ваш префильтр, score от 55. Галочки только ваши:
          откликнулись, уже смотрели, отложить. «…» — сохранить или скрыть.
        </p>
        <Shot caption="Список вакансий. Галочки слева и оценка справа.">
          <div className="guide-table">
            <div className="guide-thead">
              <span>Подался</span>
              <span>Смотрел</span>
              <span>Позже</span>
              <span>Вакансия</span>
              <span>Score</span>
            </div>
            <div className="guide-trow">
              <Hit label="Отклик">
                <span className="checkbox" />
              </Hit>
              <span className="checkbox" />
              <Hit label="Отложить">
                <span className="checkbox" />
              </Hit>
              <div>
                <span className="guide-link">Senior Product Manager</span>
                <div className="cell-sub">Acme · Berlin</div>
              </div>
              <Hit label="Насколько вам" pin="down">
                <span className="badge badge-positive">82</span>
              </Hit>
            </div>
          </div>
        </Shot>
      </section>

      <section className="card">
        <h3 className="card-title">5. Вести отклики</h3>
        <p className="card-sub">
          Вкладка «Подался» — только то, куда вы отметились. Статусы: подался → интервью → отказ. Заметки
          тоже только ваши. «Статистика» показывает вашу воронку, не общую.
        </p>
        <Shot caption="Подался. Переключайте этап прямо в строке.">
          <div className="guide-stack">
            <div className="guide-pills">
              <span className="guide-pill is-on">Все</span>
              <span className="guide-pill">Подался</span>
              <span className="guide-pill">Интервью</span>
              <span className="guide-pill">Отказ</span>
            </div>
            <div className="guide-source-row">
              <div>
                <strong>Head of Product</strong>
                <div className="cell-sub">Beispiel Bank</div>
              </div>
              <Hit label="Этап">
                <span className="btn btn-primary btn-sm">Интервью</span>
              </Hit>
              <span className="btn btn-sm">Отказ</span>
            </div>
          </div>
        </Shot>
      </section>
    </div>
  )
}
