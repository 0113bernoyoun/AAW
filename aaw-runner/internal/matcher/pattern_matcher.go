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
// Patterns are designed to match actual API rate limit errors, not casual mentions
func NewPatternMatcher() *PatternMatcher {
	return &PatternMatcher{
		patterns: []*regexp.Regexp{
			// HTTP 429 with error context (e.g., "Error: 429", "status: 429", "HTTP 429")
			regexp.MustCompile(`(?i)(error|status|http|code)[:\s]+429`),
			// Explicit rate limit error messages (with error/exceeded/hit context)
			regexp.MustCompile(`(?i)rate\s+limit\s+(exceeded|hit|reached|error)`),
			// Quota exceeded with error context
			regexp.MustCompile(`(?i)(error|failed).*quota\s+exceeded`),
			regexp.MustCompile(`(?i)quota\s+exceeded.*(error|failed)`),
			// Too Many Requests as error message
			regexp.MustCompile(`(?i)(error|status)[:\s].*too\s+many\s+requests`),
			// API-specific rate limit messages
			regexp.MustCompile(`(?i)rate_limit_exceeded`),
			regexp.MustCompile(`(?i)RateLimitError`),
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
