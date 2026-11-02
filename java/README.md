# Java Algorithm Practice

`AlgorithmPractice.java` is a standalone, menu-driven program covering:

- Multiplication of signed, arbitrarily long integer strings using digit arrays.
- Recursive and iterative integer powers with exact `BigInteger` results.
- All positive divisors of a positive integer.
- Divisibility by 9 using the sum of the digits.

Compile and run from the repository root with a JDK installed:

```text
javac java\AlgorithmPractice.java
java -cp java AlgorithmPractice
```

The power methods accept a non-negative `int` exponent. The divisor exercise
accepts a positive `long`; multiplication and the divisibility check accept
integers of arbitrary length.
