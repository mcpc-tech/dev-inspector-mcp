import { describe, it, expect } from "vitest";
import { substituteEnvVars } from "./helpers";

describe("substituteEnvVars", () => {
  const mockEnv = {
    API_KEY: "secret-123",
    HOST: "0.0.0.0",
    PORT: "8080",
    EMPTY: "",
  };

  it("should replace env vars in strings", () => {
    expect(substituteEnvVars("{API_KEY}", mockEnv)).toBe("secret-123");
    // Test lowercase support
    expect(substituteEnvVars("{lowercase_key}", { ...mockEnv, lowercase_key: "value" })).toBe("value");
    expect(substituteEnvVars("API_KEY", mockEnv)).toBe("API_KEY");
    expect(substituteEnvVars("{MISSING}", mockEnv)).toBe("{MISSING}");
  });

  it("should recursively replace env vars in objects and arrays", () => {
    const input = {
      list: ["{API_KEY}"],
      nested: {
        key: "{API_KEY}",
      },
    };
    const expected = {
      list: ["secret-123"],
      nested: {
        key: "secret-123",
      },
    };
    expect(substituteEnvVars(input, mockEnv)).toEqual(expected);
  });
});
