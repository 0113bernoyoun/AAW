package matcher

import (
	"regexp"
	"strings"
)

// PatternMatcher detects rate limit patterns in log lines
type PatternMatcher struct {
	patterns []*regexp.Regexp
}

// NewPatternMatcher creates a new pattern matcher
func NewPatternMatcher() *PatternMatcher {
	return &PatternMatcher{
		patterns: []*regexp.Regexp{
			regexp.MustCompile(`(?i)429`),                      // HTTP 429 status code
			regexp.MustCompile(`(?i)rate\s+limit`),             // "Rate limit" or "rate limit"
			regexp.MustCompile(`(?i)quota\s+exceeded`),         // "Quota exceeded"
			regexp.MustCompile(`(?i)too\s+many\s+requests`),    // "Too Many Requests"
			regexp.MustCompile(`(?i)limit\s+reached`),          // "Limit reached"
		},
	}
}

// IsRateLimitDetected checks if the log line contains rate limit patterns
func (pm *PatternMatcher) IsRateLimitDetected(line string) bool {
	trimmedLine := strings.TrimSpace(line)

	for _, pattern := range pm.patterns {
		if pattern.MatchString(trimmedLine) {
			return true
		}
	}

	return false
}
