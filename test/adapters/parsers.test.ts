import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { parseArbeitsagentur } from "../../src/adapters/arbeitsagentur"
import { parseArbeitnow } from "../../src/adapters/arbeitnow"
import { parseAshby } from "../../src/adapters/ashby"
import { parseGreenhouse } from "../../src/adapters/greenhouse"
import { parseHimalayas } from "../../src/adapters/himalayas"
import { parseJobicy } from "../../src/adapters/jobicy"
import { parseLever } from "../../src/adapters/lever"
import { parsePersonio } from "../../src/adapters/personio"
import { parseRecruitee } from "../../src/adapters/recruitee"
import { parseRss } from "../../src/adapters/rss"
import { parseSmartRecruiters } from "../../src/adapters/smartrecruiters"
import { parseTheHub } from "../../src/adapters/thehub"
import { parseWeWorkRemotely } from "../../src/adapters/weworkremotely"
import { parseWorkable } from "../../src/adapters/workable"
import { parseAdzuna } from "../../src/adapters/adzuna"
import { detectToken } from "../../src/adapters"
import { labelFromUrl } from "../../src/adapters/career-ops"
import { toIso } from "../../src/http"

function load(name: string) {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8")
}

describe("adapter parsers", () => {
  it("parses arbeitsagentur openapi example", () => {
    const jobs = parseArbeitsagentur(JSON.parse(load("arbeitsagentur.json")))
    expect(jobs[0]?.externalId).toBe("10000-1184867112-S")
    expect(jobs[0]?.location).toBe("Berlin")
  })

  it("parses arbeitnow public api", () => {
    const jobs = parseArbeitnow(JSON.parse(load("arbeitnow.json")))
    expect(jobs.length).toBe(3)
    expect(jobs[0]?.company).toContain("GlasfaserPlus")
    expect(jobs[0]?.url).toContain("arbeitnow.com")
  })

  it("parses greenhouse board", () => {
    const jobs = parseGreenhouse(JSON.parse(load("greenhouse.json")))
    expect(jobs[0]?.title).toBe("Acquisition Manager")
    expect(jobs[0]?.url).toContain("airbnb")
  })

  it("parses ashby board", () => {
    const jobs = parseAshby(JSON.parse(load("ashby.json")), "linear")
    expect(jobs[0]?.externalId).toContain("d3bc1ced")
    expect(jobs[0]?.url).toContain("ashbyhq.com")
  })

  it("parses lever postings", () => {
    const jobs = parseLever(JSON.parse(load("lever.json")), "palantir")
    expect(jobs[0]?.title).toBe("Administrative Business Partner")
    expect(jobs[0]?.location).toContain("London")
  })

  it("parses smartrecruiters", () => {
    const jobs = parseSmartRecruiters(JSON.parse(load("smartrecruiters.json")))
    expect(jobs[0]?.title).toBe("Senior Information Security Engineer")
    expect(jobs.length).toBe(2)
  })

  it("parses personio xml envelope", () => {
    expect(parsePersonio(load("personio.xml"))).toEqual([])
    const xml = `<?xml version="1.0"?><workzag-jobs><position><id>42</id><name>Product Manager</name><office>Berlin</office><createdAt>2026-01-01</createdAt><jobDescriptions><jobDescription><name>Desc</name><value><![CDATA[<p>Payments</p>]]></value></jobDescription></jobDescriptions></position></workzag-jobs>`
    const jobs = parsePersonio(xml, "acme")
    expect(jobs[0]?.title).toBe("Product Manager")
    expect(jobs[0]?.location).toBe("Berlin")
  })

  it("parses workable widget", () => {
    expect(parseWorkable(JSON.parse(load("workable.json")))).toEqual([])
    const jobs = parseWorkable({
      name: "Doist",
      jobs: [
        {
          title: "Product Manager",
          shortcode: "ABCDE",
          application_url: "https://apply.workable.com/j/ABCDE",
          location: { city: "Berlin", country: "Germany" },
          created_at: "2026-01-01",
          description: "Senior PM",
        },
      ],
    })
    expect(jobs[0]?.externalId).toBe("ABCDE")
  })

  it("parses recruitee offers schema", () => {
    const jobs = parseRecruitee({
      offers: [
        {
          id: 9,
          title: "Product Owner",
          careers_url: "https://acme.recruitee.com/o/po",
          location: { city: "Berlin" },
          published_at: "2026-01-01",
          description: "Fintech",
        },
      ],
    })
    expect(jobs[0]?.url).toContain("recruitee.com")
  })

  it("parses rss feed", () => {
    const jobs = parseRss(load("rss.xml"))
    expect(jobs.length).toBeGreaterThan(0)
    expect(jobs[0]?.url).toContain("weworkremotely.com")
  })

  it("parses adzuna results", () => {
    const jobs = parseAdzuna({
      results: [
        {
          id: "123",
          title: "Product Manager",
          redirect_url: "https://www.adzuna.de/land/ad/123",
          created: "2026-01-01",
          location: { display_name: "Berlin" },
          company: { display_name: "Acme" },
          description: "Senior PM",
        },
      ],
    })
    expect(jobs[0]?.company).toBe("Acme")
  })

  it("parses himalayas feed", () => {
    const jobs = parseHimalayas({
      jobs: [
        {
          title: "Product Lead, AI Email App",
          companyName: "Bjak",
          locationRestrictions: ["China"],
          description: "About the role",
          pubDate: 1787983183,
          guid: "https://himalayas.app/companies/bjak/jobs/product-lead",
          applicationLink: "https://himalayas.app/companies/bjak/jobs/product-lead",
        },
      ],
    })
    expect(jobs[0]?.company).toBe("Bjak")
    expect(jobs[0]?.location).toBe("China")
    expect(jobs[0]?.postedAt?.slice(0, 4)).toBe("2026")
  })

  it("filters himalayas by needle but keeps everything on *", () => {
    const payload = { jobs: [{ title: "Backend Engineer", guid: "https://himalayas.app/x", companyName: "Acme" }] }
    expect(parseHimalayas(payload, "product")).toEqual([])
    expect(parseHimalayas(payload, "*").length).toBe(1)
  })

  it("parses jobicy feed", () => {
    const jobs = parseJobicy({
      jobs: [
        {
          id: 151960,
          url: "https://jobicy.com/jobs/151960-growth-marketing-manager",
          jobTitle: "Growth Marketing Manager",
          companyName: "Keyfactor, Inc.",
          jobGeo: "Canada, USA",
          jobDescription: "<p>About Keyfactor</p>",
          pubDate: "2026-08-28T18:59:52+00:00",
        },
      ],
    })
    expect(jobs[0]?.externalId).toBe("151960")
    expect(jobs[0]?.location).toBe("Canada, USA")
    expect(jobs[0]?.description).toBe("About Keyfactor")
  })

  it("parses thehub docs and merges featured", () => {
    const jobs = parseTheHub({
      jobs: {
        pages: 1,
        docs: [
          {
            id: "6a58cbb9e8c4ea90606db214",
            title: "Head of Germany",
            location: { country: "Germany", locality: "Berlin" },
            company: { name: "Complir" },
          },
        ],
      },
      featuredJobs: {
        docs: [{ id: "feat1", title: "GTM Lead, DACH", isRemote: true, company: { name: "Sumary" } }],
      },
    })
    expect(jobs.length).toBe(2)
    expect(jobs[0]?.url).toBe("https://thehub.io/jobs/6a58cbb9e8c4ea90606db214")
    expect(jobs[0]?.location).toBe("Berlin, Germany")
    expect(jobs[1]?.location).toBe("Remote")
  })

  it("drops feed rows whose link left the board's host", () => {
    const jobs = parseHimalayas({
      jobs: [
        { title: "Product Manager", guid: "http://himalayas.app/insecure", companyName: "A" },
        { title: "Product Manager", guid: "https://evil.example/phish", companyName: "B" },
        { title: "Product Manager", guid: "https://himalayas.app/ok", companyName: "C" },
      ],
    })
    expect(jobs.map((job) => job.company)).toEqual(["C"])
  })

  it("normalises epoch seconds, epoch ms and date strings", () => {
    expect(toIso(1787983183)?.slice(0, 4)).toBe("2026")
    expect(toIso(1787983183000)?.slice(0, 4)).toBe("2026")
    expect(toIso("2026-08-28T18:59:52+00:00")).toBe("2026-08-28T18:59:52.000Z")
    expect(toIso("not a date")).toBeUndefined()
    expect(toIso(null)).toBeUndefined()
  })

  it("splits the company out of a we work remotely title", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>Acme: Senior Product Manager</title><region>Europe</region>
        <link>https://weworkremotely.com/remote-jobs/acme-spm</link>
        <pubDate>Fri, 28 Aug 2026 10:00:00 +0000</pubDate></item>
      <item><title>Standalone Product Role</title><category>Anywhere</category>
        <link>https://weworkremotely.com/remote-jobs/solo</link></item>
    </channel></rss>`
    const jobs = parseWeWorkRemotely(xml)
    expect(jobs[0]?.company).toBe("Acme")
    expect(jobs[0]?.title).toBe("Senior Product Manager")
    expect(jobs[0]?.location).toBe("Europe")
    expect(jobs[1]?.company).toBeUndefined()
    expect(jobs[1]?.title).toBe("Standalone Product Role")
  })

  it("names a single-company board from its URL", () => {
    // These boards are one company, so the payload never repeats its name and
    // the vendored providers read it off the config entry instead.
    expect(labelFromUrl("https://join.com/companies/acme/jobs")).toBe("acme")
    expect(labelFromUrl("https://acme.teamtailor.com")).toBe("acme")
    expect(labelFromUrl("https://careers.acme.softgarden.io/de/widgets/jobs")).toBe("acme")
    expect(labelFromUrl("https://www.acme.com/jobs")).toBe("acme")
    expect(labelFromUrl("not a url")).toBe("not a url")
  })

  it("detects ATS tokens from URLs", () => {
    expect(detectToken(new URL("https://boards.greenhouse.io/airbnb"))).toEqual({
      provider: "greenhouse",
      token: "airbnb",
    })
    expect(detectToken(new URL("https://jobs.lever.co/palantir/abc"))).toEqual({
      provider: "lever",
      token: "palantir",
    })
    expect(detectToken(new URL("https://jobs.ashbyhq.com/linear"))).toEqual({
      provider: "ashby",
      token: "linear",
    })
    expect(detectToken(new URL("https://acme.jobs.personio.de/job/1"))).toEqual({
      provider: "personio",
      token: "acme",
    })
  })
})
