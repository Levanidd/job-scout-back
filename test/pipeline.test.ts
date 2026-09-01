import { describe, expect, it } from "vitest"

import { companyKey } from "../src/company-key"
import { isSuspicious } from "../src/ingest"
import { passesPrefilter } from "../src/prefilter"
import { formatSalary, toSalary } from "../src/salary"
import { localScore } from "../src/scoring"

describe("companyKey", () => {
  it("collapses legal suffixes and punctuation", () => {
    expect(companyKey("Acme GmbH")).toBe("acme")
    expect(companyKey("Beispiel Bank AG")).toBe("beispiel bank")
    expect(companyKey("Foo, Inc.")).toBe("foo")
  })
})

describe("prefilter", () => {
  it("keeps product roles and drops students", () => {
    expect(passesPrefilter("Senior Product Manager")).toBe(true)
    expect(passesPrefilter("Werkstudent Produktmanagement")).toBe(false)
    expect(passesPrefilter("Backend Engineer")).toBe(false)
  })
})

describe("ingest guard", () => {
  it("flags a truncated fetch", () => {
    expect(isSuspicious(100, 40)).toBe(true)
    expect(isSuspicious(100, 80)).toBe(false)
    expect(isSuspicious(null, 0)).toBe(false)
  })
})

describe("salary", () => {
  it("normalises yearly ranges and greenhouse cents", () => {
    expect(toSalary({ min: 80_000, max: 110_000, currency: "eur" })).toEqual({
      min: 80_000,
      max: 110_000,
      currency: "EUR",
    })
    expect(toSalary({ min: 8_000_000, max: 11_000_000, currency: "EUR", cents: true })).toEqual({
      min: 80_000,
      max: 110_000,
      currency: "EUR",
    })
    expect(toSalary({ min: 40, period: "hour", currency: "EUR" })?.min).toBe(83_200)
    expect(formatSalary(80_000, 110_000, "EUR")).toBe("€80k–110k")
    expect(formatSalary(150_000, null, "USD")).toBe("от $150k")
  })
})

describe("local scoring", () => {
  it("zeros junior roles", () => {
    const result = localScore({
      external_id: "1",
      title: "Jr. Product Manager",
      company: "X",
      location: "Köln",
      description: "Junior role",
    })
    expect(result.score).toBe(0)
    expect(result.flags).toContain("not_senior")
  })
})
