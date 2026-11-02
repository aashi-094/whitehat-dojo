import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Scanner;

public class AlgorithmPractice {
    private static final Scanner INPUT = new Scanner(System.in);

    public static void main(String[] args) {
        while (true) {
            System.out.println();
            System.out.println("Algorithm Practice");
            System.out.println("1. Multiply two large numbers");
            System.out.println("2. Power of a number (recursive and iterative)");
            System.out.println("3. Find all divisors");
            System.out.println("4. Check divisibility by 9 using digit sum");
            System.out.println("0. Exit");
            System.out.print("Choose an option: ");

            String choice = INPUT.nextLine().trim();
            try {
                switch (choice) {
                    case "1":
                        multiplyNumbers();
                        break;
                    case "2":
                        calculatePowers();
                        break;
                    case "3":
                        listDivisors();
                        break;
                    case "4":
                        checkDivisibilityByNine();
                        break;
                    case "0":
                        System.out.println("Goodbye!");
                        return;
                    default:
                        System.out.println("Please choose an option from 0 to 4.");
                }
            } catch (IllegalArgumentException exception) {
                System.out.println("Invalid input: " + exception.getMessage());
            }
        }
    }

    public static String multiply(String first, String second) {
        String left = normalizeInteger(first);
        String right = normalizeInteger(second);
        boolean negative = left.charAt(0) == '-' ^ right.charAt(0) == '-';

        left = unsignedDigits(left);
        right = unsignedDigits(right);
        if ("0".equals(left) || "0".equals(right)) {
            return "0";
        }

        int[] digits = new int[left.length() + right.length()];
        for (int i = left.length() - 1; i >= 0; i--) {
            for (int j = right.length() - 1; j >= 0; j--) {
                int position = i + j + 1;
                int product = (left.charAt(i) - '0') * (right.charAt(j) - '0')
                        + digits[position];
                digits[position] = product % 10;
                digits[position - 1] += product / 10;
            }
        }

        StringBuilder result = new StringBuilder(digits.length + 1);
        int firstNonZero = 0;
        while (firstNonZero < digits.length - 1 && digits[firstNonZero] == 0) {
            firstNonZero++;
        }
        if (negative) {
            result.append('-');
        }
        for (int i = firstNonZero; i < digits.length; i++) {
            result.append(digits[i]);
        }
        return result.toString();
    }

    public static BigInteger powerRecursive(BigInteger base, int exponent) {
        validateExponent(exponent);
        if (exponent == 0) {
            return BigInteger.ONE;
        }

        BigInteger halfPower = powerRecursive(base, exponent / 2);
        BigInteger result = halfPower.multiply(halfPower);
        return exponent % 2 == 0 ? result : result.multiply(base);
    }

    public static BigInteger powerIterative(BigInteger base, int exponent) {
        validateExponent(exponent);
        BigInteger result = BigInteger.ONE;
        BigInteger factor = base;
        int remainingExponent = exponent;

        while (remainingExponent > 0) {
            if (remainingExponent % 2 == 1) {
                result = result.multiply(factor);
            }
            factor = factor.multiply(factor);
            remainingExponent /= 2;
        }
        return result;
    }

    public static List<Long> findDivisors(long number) {
        if (number <= 0) {
            throw new IllegalArgumentException("The number must be a positive integer.");
        }

        List<Long> lowerDivisors = new ArrayList<Long>();
        List<Long> upperDivisors = new ArrayList<Long>();
        for (long divisor = 1; divisor <= number / divisor; divisor++) {
            if (number % divisor == 0) {
                lowerDivisors.add(divisor);
                long pairedDivisor = number / divisor;
                if (pairedDivisor != divisor) {
                    upperDivisors.add(pairedDivisor);
                }
            }
        }
        Collections.reverse(upperDivisors);
        lowerDivisors.addAll(upperDivisors);
        return lowerDivisors;
    }

    public static BigInteger sumDigits(String number) {
        String digits = normalizeInteger(number);
        BigInteger sum = BigInteger.ZERO;
        for (int i = digits.charAt(0) == '-' ? 1 : 0; i < digits.length(); i++) {
            sum = sum.add(BigInteger.valueOf(digits.charAt(i) - '0'));
        }
        return sum;
    }

    public static boolean isDivisibleByNine(String number) {
        return sumDigits(number).remainder(BigInteger.valueOf(9)).equals(BigInteger.ZERO);
    }

    private static void multiplyNumbers() {
        System.out.print("Enter the first integer: ");
        String first = INPUT.nextLine();
        System.out.print("Enter the second integer: ");
        String second = INPUT.nextLine();
        System.out.println("Product: " + multiply(first, second));
    }

    private static void calculatePowers() {
        System.out.print("Enter the base (integer): ");
        BigInteger base = new BigInteger(INPUT.nextLine().trim());
        System.out.print("Enter a non-negative integer exponent: ");
        int exponent = Integer.parseInt(INPUT.nextLine().trim());
        System.out.println("Recursive result: " + powerRecursive(base, exponent));
        System.out.println("Iterative result: " + powerIterative(base, exponent));
    }

    private static void listDivisors() {
        System.out.print("Enter a positive integer: ");
        long number = Long.parseLong(INPUT.nextLine().trim());
        System.out.println("Divisors: " + findDivisors(number));
    }

    private static void checkDivisibilityByNine() {
        System.out.print("Enter an integer: ");
        String number = INPUT.nextLine();
        BigInteger digitSum = sumDigits(number);
        System.out.println("Digit sum: " + digitSum);
        System.out.println(number.trim() + (isDivisibleByNine(number)
                ? " is divisible by 9."
                : " is not divisible by 9."));
    }

    private static String normalizeInteger(String value) {
        if (value == null) {
            throw new IllegalArgumentException("Enter a whole number.");
        }

        String number = value.trim();
        if (!number.matches("[+-]?\\d+")) {
            throw new IllegalArgumentException("Only an optional sign and decimal digits are allowed.");
        }

        boolean negative = number.charAt(0) == '-';
        int firstDigit = number.charAt(0) == '-' || number.charAt(0) == '+' ? 1 : 0;
        while (firstDigit < number.length() - 1 && number.charAt(firstDigit) == '0') {
            firstDigit++;
        }
        String digits = number.substring(firstDigit);
        if ("0".equals(digits)) {
            return "0";
        }
        return negative ? "-" + digits : digits;
    }

    private static String unsignedDigits(String number) {
        return number.charAt(0) == '-' ? number.substring(1) : number;
    }

    private static void validateExponent(int exponent) {
        if (exponent < 0) {
            throw new IllegalArgumentException("The exponent must be non-negative.");
        }
    }
}
