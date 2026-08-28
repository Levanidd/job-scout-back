import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { parseArbeitsagentur } from "../../src/adapters/arbeitsagentur"
import { parseArbeitnow } from "../../src/adapters/arbeitnow"
import { parseAshby } from "../../src/adapters/ashby"
import { parseGreenhouse } from "../../src/adapters/greenhouse"
import { parseLever } from "../../src/adapters/lever"
import { parsePersonio } from "../../src/adapters/personio"
import { parseRecruitee } from "../../src/adapters/recruitee"
import { parseRss } from "../../src/adapters/rss"
import { parseSmartRecruiters } from "../../src/adapters/smartrecruiters"
import { parseWorkable } from "../../src/adapters/workable"
import { parseAdzuna } from "../../src/adapters/adzuna"
import { detectToken } from "../../src/adapters"

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
